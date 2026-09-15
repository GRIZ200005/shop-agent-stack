"""Untrusted personal endpoints: HTTPS, public addresses, pinned DNS, original TLS SNI."""
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit
import httpx
from .store import StoreError


def validate_url(value):
    try:
        url = urlsplit(value)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.port not in (None, 443) or "\\" in value:
            raise ValueError()
        host = url.hostname
        if host.lower() == "localhost" or host.endswith(".localhost"):
            raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:
                raise ValueError("private")
        except ValueError as exc:
            if str(exc) == "private":
                raise
    except (ValueError, TypeError):
        raise StoreError("API 地址须为公网 HTTPS 地址（443 端口），不能包含凭据或查询参数", 400) from None
    return url


class PublicTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.inner = httpx.AsyncHTTPTransport(retries=0)

    async def handle_async_request(self, request):
        url = validate_url(str(request.url))
        try:
            records = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(url.hostname, 443, type=socket.SOCK_STREAM), 5)
        except (OSError, TimeoutError):
            raise StoreError("无法解析模型服务地址", 400) from None
        ips = list(dict.fromkeys(r[4][0] for r in records))
        if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
            raise StoreError("模型地址解析到了非公网地址，连接已阻止", 400)
        # The socket connects to the validated IP, so no second DNS lookup can rebind it.
        request.headers["Host"] = url.hostname
        request.extensions["sni_hostname"] = url.hostname
        request.url = request.url.copy_with(host=ips[0])
        return await self.inner.handle_async_request(request)

    async def aclose(self):
        await self.inner.aclose()
