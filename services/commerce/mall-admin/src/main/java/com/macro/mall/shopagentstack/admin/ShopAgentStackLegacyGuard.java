package com.macro.mall.shopagentstack.admin;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Original ShopAgentStack guard: legacy admin APIs must not bypass staff role boundaries. */
@Configuration
public class ShopAgentStackLegacyGuard implements WebMvcConfigurer {
    private final ShopAgentStackStaffAccess access;
    public ShopAgentStackLegacyGuard(ShopAgentStackStaffAccess access) { this.access=access; }
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            public boolean preHandle(HttpServletRequest req,HttpServletResponse res,Object handler) {
                access.require(req.getUserPrincipal(),true); return true;
            }
        }).addPathPatterns("/**").excludePathPatterns("/shop_agent_stack/**","/admin/login","/admin/register","/admin/info","/admin/logout","/actuator/**","/swagger-ui/**","/swagger-ui.html","/v3/api-docs/**","/error");
    }
}
