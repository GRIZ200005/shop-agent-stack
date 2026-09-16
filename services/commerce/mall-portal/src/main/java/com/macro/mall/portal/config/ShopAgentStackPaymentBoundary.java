package com.macro.mall.portal.config;

import com.macro.mall.common.api.ResultCode;
import com.macro.mall.common.exception.Asserts;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** P1 exposes only its owned payment simulator, not unverified legacy payment/cancellation entrypoints. */
@Configuration
public class ShopAgentStackPaymentBoundary implements WebMvcConfigurer {
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
                Asserts.fail(ResultCode.FORBIDDEN); return false;
            }
        }).addPathPatterns("/alipay/**","/order/paySuccess","/order/cancelTimeOutOrder","/order/cancelUserOrder");
    }
}
