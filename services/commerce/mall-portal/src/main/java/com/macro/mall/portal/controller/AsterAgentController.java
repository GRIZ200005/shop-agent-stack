package com.macro.mall.portal.controller;

import com.macro.mall.aster.AgentOperationService;
import com.macro.mall.aster.AfterSaleService;
import com.macro.mall.aster.PolicyService;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.portal.service.UmsMemberService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

/** User confirmation and execution-context endpoints intentionally have different authentication. */
@RestController
@RequestMapping("/aster")
public class AsterAgentController {
    private final AgentOperationService ops; private final UmsMemberService members; private final AfterSaleService sales;
    private final PolicyService policies;
    public AsterAgentController(AgentOperationService ops,UmsMemberService members,AfterSaleService sales,PolicyService policies){this.ops=ops;this.members=members;this.sales=sales;this.policies=policies;}
    private void indexAuth(String supplied) {
        try {
            String expected=java.nio.file.Files.readString(java.nio.file.Path.of("/run/secrets/index_key")).trim();
            if(expected.length()>=32 && java.security.MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.UTF_8),supplied.getBytes(java.nio.charset.StandardCharsets.UTF_8))) return;
        } catch(java.io.IOException ignored) { }
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED);
    }
    @GetMapping("/internal/agent/index/state") public CommonResult<?> indexState(@RequestHeader(value="X-Aster-Index",defaultValue="") String key){indexAuth(key);return CommonResult.success(policies.indexState());}
    @GetMapping("/internal/agent/index/catalog") public CommonResult<?> indexCatalog(@RequestHeader(value="X-Aster-Index",defaultValue="") String key,@RequestParam(defaultValue="0") long after){indexAuth(key);return CommonResult.success(policies.catalog(after));}
    public record IndexResult(long revision,boolean success,String collection) {}
    @PostMapping("/internal/agent/index/result") public CommonResult<?> indexResult(@RequestHeader(value="X-Aster-Index",defaultValue="") String key,@RequestBody IndexResult body){indexAuth(key);policies.indexResult(body.revision(),body.success(),body.collection());return CommonResult.success(null);}
    @GetMapping("/internal/agent/policies") public CommonResult<?> policies(@RequestHeader("X-Aster-Execution") String token,@RequestParam(defaultValue="0") long after){ops.identify(token);return CommonResult.success(policies.catalog(after));}
    @GetMapping("/internal/agent/policies/{id}") public CommonResult<?> source(@RequestHeader("X-Aster-Execution") String token,@PathVariable long id,@RequestParam int version){ops.identify(token);return CommonResult.success(policies.source(id,version));}
    public record Preview(@NotNull @Positive Long orderId,@NotBlank @Size(max=500) String reason) {}
    public record Confirmation(@NotBlank @Size(max=200) String confirmationToken) {}
    @PostMapping("/agent/context") public CommonResult<?> grant(){return CommonResult.success(ops.grant(members.getCurrentMember().getId()));}
    @PostMapping("/agent/operations/{id}/confirm") public CommonResult<?> confirm(@PathVariable String id,@Valid @RequestBody Confirmation body){return CommonResult.success(ops.confirm(members.getCurrentMember().getId(),id,body.confirmationToken()));}
    @PostMapping("/agent/operations/{id}/cancel") public CommonResult<?> cancel(@PathVariable String id){ops.cancel(members.getCurrentMember().getId(),id);return CommonResult.success(null);}
    @GetMapping("/internal/agent/orders") public CommonResult<?> orders(@RequestHeader("X-Aster-Execution") String token){return CommonResult.success(ops.orders(ops.identify(token)));}
    @GetMapping("/internal/agent/orders/{id}") public CommonResult<?> order(@RequestHeader("X-Aster-Execution") String token,@PathVariable long id){return CommonResult.success(ops.order(ops.identify(token),id));}
    @GetMapping("/internal/agent/after-sales") public CommonResult<?> sales(@RequestHeader("X-Aster-Execution") String token){return CommonResult.success(sales.mine(ops.identify(token)));}
    @PostMapping("/internal/agent/preview") public CommonResult<?> preview(@RequestHeader("X-Aster-Execution") String token,@Valid @RequestBody Preview body){return CommonResult.success(ops.preview(ops.identify(token),body.orderId(),body.reason()));}
    @GetMapping("/internal/agent/operations/{id}") public CommonResult<?> status(@RequestHeader("X-Aster-Execution") String token,@PathVariable String id){return CommonResult.success(ops.status(ops.identify(token),id));}
    @PostMapping("/internal/agent/operations/{id}/execute") public CommonResult<?> execute(@RequestHeader("X-Aster-Execution") String token,@PathVariable String id){return CommonResult.success(ops.execute(ops.identify(token),id));}
}
