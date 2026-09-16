package com.macro.mall.shopagentstack.admin;

import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.service.UmsAdminService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Local startup bootstrap. Passwords are supplied by the operator; never returned by an API. */
@Component
public class ShopAgentStackBootstrap implements CommandLineRunner {
    private final Environment env; private final UmsAdminService admins; private final JdbcTemplate db;
    public ShopAgentStackBootstrap(Environment env,UmsAdminService admins,JdbcTemplate db) { this.env=env;this.admins=admins;this.db=db; }
    public void run(String... args) {
        create("shop_agent_stack_admin","商城管理员","ADMIN","SHOP_AGENT_STACK_BOOTSTRAP_ADMIN_PASSWORD");
        create("shop_agent_stack_service","ShopAgentStack客服","SERVICE","SHOP_AGENT_STACK_BOOTSTRAP_SERVICE_PASSWORD");
    }
    private void create(String username,String name,String role,String key) {
        String password=env.getProperty(key,"");
        if(password.isBlank()) return;
        var existing=admins.getAdminByUsername(username);
        if(existing!=null) {
            if(db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_staff WHERE admin_id=?",Integer.class,existing.getId())==0) throw new IllegalStateException("Bootstrap username already exists without an ShopAgentStack role");
            return;
        }
        if(password.length()<12) throw new IllegalStateException("Bootstrap password too short");
        var input=new UmsAdminParam(); input.setUsername(username);input.setPassword(password);input.setNickName(name);
        var created=admins.register(input);
        db.update("INSERT INTO shop_agent_stack_staff(admin_id,role) VALUES(?,?)",created.getId(),role);
    }
}
