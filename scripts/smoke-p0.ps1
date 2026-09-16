param([string]$Portal = 'http://127.0.0.1:18085', [string]$Admin = 'http://127.0.0.1:18080')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$checks = [Collections.Generic.List[string]]::new()
function Assert-P0([bool]$Condition, [string]$Name) {
    if (-not $Condition) { throw "FAILED: $Name" }
    $checks.Add($Name)
    Write-Output "PASS: $Name"
}
function Api([string]$Method, [string]$Url, $Body = $null, [string]$Token = '', [switch]$Form) {
    $params = @{Method=$Method; Uri=$Url; TimeoutSec=30; SkipHttpErrorCheck=$true; NoProxy=$true}
    if ($Token) { $params.Headers = @{Authorization=$Token} }
    if ($null -ne $Body) {
        if ($Form) { $params.Body=$Body; $params.ContentType='application/x-www-form-urlencoded' }
        else { $params.Body=ConvertTo-Json -InputObject $Body -Depth 12 -Compress; $params.ContentType='application/json' }
    }
    return Invoke-RestMethod @params
}
function New-Customer([string]$Suffix) {
    $tag = [guid]::NewGuid().ToString('N').Substring(0,12)
    $username = "p0_${Suffix}_$tag"
    $password = [guid]::NewGuid().ToString('N') + 'aA!9'
    $telephone = "000$($tag.Substring(0,8))" # Deliberately synthetic; local OTP API sends no SMS.
    $otp = Api GET "$Portal/sso/getAuthCode?telephone=$telephone"
    if ($otp.code -ne 200) { throw 'Local OTP failed.' }
    $registered = Api POST "$Portal/sso/register" @{username=$username;password=$password;telephone=$telephone;authCode=$otp.data} -Form
    if ($registered.code -ne 200) { throw 'Customer registration failed.' }
    $login = Api POST "$Portal/sso/login" @{username=$username;password=$password} -Form
    if ($login.code -ne 200) { throw 'Customer login failed.' }
    $token = $login.data.tokenHead + $login.data.token
    $info = Api GET "$Portal/sso/info" -Token $token
    return @{Token=$token;Id=$info.data.id}
}

Assert-P0 ((Api GET "$Portal/actuator/health").status -eq 'UP') 'portal_health'
Assert-P0 ((Api GET "$Admin/actuator/health").status -eq 'UP') 'admin_health'
$products = Api GET "$Portal/product/search?keyword=ShopAgentStack&pageNum=1&pageSize=10"
Assert-P0 ($products.code -eq 200 -and @($products.data.list | Where-Object id -eq 1).Count -eq 1) 'synthetic_product_search'
Assert-P0 ([decimal]($products.data.list | Where-Object id -eq 1).price -eq [decimal]49.90) 'catalog_price'
$anonymous = Api GET "$Portal/order/list?status=-1"
Assert-P0 ($anonymous.code -eq 401) 'anonymous_order_access_denied'
$alice = New-Customer 'a'
$bob = New-Customer 'b'
Assert-P0 ($alice.Id -gt 0 -and $bob.Id -ne $alice.Id) 'two_customer_logins'
$address = @{name='Synthetic Receiver';phoneNumber='00000000000';defaultStatus=1;postCode='000000';province='Test';city='Test';region='Test';detailAddress='Fixture Only 1'}
$addAddress = Api POST "$Portal/member/address/add" $address -Token $alice.Token
if ($addAddress.code -ne 200) { throw 'Address creation failed.' }
$addresses = Api GET "$Portal/member/address/list" -Token $alice.Token
$addressId = $addresses.data[0].id
$cart = @{productId=1;productSkuId=1;quantity=2;price=0.01;productName='ShopAgentStack USB-C Cable';productSkuCode='SHOP_AGENT_STACK-CABLE-BLACK-1M';productCategoryId=1;productBrand='ShopAgentStack Lab';productSn='SHOP_AGENT_STACK-CABLE-001'}
$added = Api POST "$Portal/cart/add" $cart -Token $alice.Token
Assert-P0 ($added.code -eq 200) 'cart_created'
$list = Api GET "$Portal/cart/list" -Token $alice.Token
$cartId = $list.data[0].id
$inputOrder = @{memberReceiveAddressId=$addressId;payType=0;cartIds=@($cartId)}
$created = Api POST "$Portal/order/generateOrder" $inputOrder -Token $alice.Token
Assert-P0 ($created.code -eq 200 -and $created.data.order.id -gt 0) 'order_created_via_api'
$orderId = [long]$created.data.order.id
Assert-P0 ([decimal]$created.data.order.payAmount -eq [decimal]99.80) 'server_price_overrides_client_price'
$detail = Api GET "$Portal/order/detail/$orderId" -Token $alice.Token
Assert-P0 ($detail.code -eq 200 -and $detail.data.memberId -eq $alice.Id -and $detail.data.orderItemList[0].productQuantity -eq 2) 'owner_order_detail'
$ownList = Api GET "$Portal/order/list?status=-1" -Token $alice.Token
Assert-P0 (@($ownList.data.list | Where-Object id -eq $orderId).Count -eq 1) 'owner_order_list'
$foreign = Api GET "$Portal/order/detail/$orderId" -Token $bob.Token
Assert-P0 ($foreign.code -ne 200 -and $null -eq $foreign.data) 'other_customer_order_detail_denied'
$otherList = Api GET "$Portal/order/list?status=-1" -Token $bob.Token
Assert-P0 ($otherList.code -eq 200 -and $otherList.data.total -eq 0 -and ($null -eq $otherList.data.list -or @($otherList.data.list).Count -eq 0)) 'other_customer_list_isolated'
$empty = Api POST "$Portal/order/generateOrder" $inputOrder -Token $alice.Token
Assert-P0 ($empty.code -ne 200) 'empty_cart_rejected'
$tag = [guid]::NewGuid().ToString('N').Substring(0,12)
$adminBody = @{username="p0_admin_$tag"; password=([guid]::NewGuid().ToString('N')+'aA!9');nickName='P0 Test Admin';email='fixture@example.invalid'}
$registeredAdmin = Api POST "$Admin/admin/register" $adminBody
Assert-P0 ($registeredAdmin.code -eq 403) 'public_admin_registration_disabled'
$adminBody = Get-Content (Join-Path $root '.local/p1-accounts.json') -Raw | ConvertFrom-Json | Where-Object role -eq 'ADMIN' | Select-Object -First 1
$adminLogin = Api POST "$Admin/admin/login" @{username=$adminBody.username;password=$adminBody.password}
Assert-P0 ($adminLogin.code -eq 200 -and $adminLogin.data.token) 'admin_login'
$adminInfo = Api GET "$Admin/admin/info" -Token ($adminLogin.data.tokenHead+$adminLogin.data.token)
Assert-P0 ($adminInfo.code -eq 200 -and $adminInfo.data.username -eq $adminBody.username) 'admin_identity'

$report = @{timestampUtc=[DateTime]::UtcNow.ToString('o');passed=$checks.Count;checks=@($checks);orderId=$orderId;memberId=$alice.Id;expectedAmount='99.80';expectedQuantity=2;upstream='9bfc2fd2c4aaa4ac519e9152e65d673a5380de1a'}
New-Item -ItemType Directory -Path (Join-Path $root '.local') -Force | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $root '.local/p0-smoke.json')
Write-Output "P0 API smoke complete: $($checks.Count) checks. Order $orderId. No credentials saved."
