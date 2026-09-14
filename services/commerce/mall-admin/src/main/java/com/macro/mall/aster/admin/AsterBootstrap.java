package com.macro.mall.aster.admin;

import com.macro.mall.dto.UmsAdminParam;
import com.macro.mall.service.UmsAdminService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Local startup bootstrap. Passwords are supplied by the operator; never returned by an API. */
@Component
public class AsterBootstrap implements CommandLineRunner {
    private final Environment env; private final UmsAdminService admins; private final JdbcTemplate db;
    public AsterBootstrap(Environment env,UmsAdminService admins,JdbcTemplate db) { this.env=env;this.admins=admins;this.db=db; }
    public void run(String... args) {
        create("aster_admin","星序管理员","ADMIN","ASTER_BOOTSTRAP_ADMIN_PASSWORD");
        create("aster_service","星序客服","SERVICE","ASTER_BOOTSTRAP_SERVICE_PASSWORD");
    }
    private void create(String username,String name,String role,String key) {
        String password=env.getProperty(key,"");
        if(password.isBlank()) return;
        var existing=admins.getAdminByUsername(username);
        if(existing!=null) {
            if(db.queryForObject("SELECT COUNT(*) FROM aster_staff WHERE admin_id=?",Integer.class,existing.getId())==0) throw new IllegalStateException("Bootstrap username already exists without an Aster role");
            return;
        }
        if(password.length()<12) throw new IllegalStateException("Bootstrap password too short");
        var input=new UmsAdminParam(); input.setUsername(username);input.setPassword(password);input.setNickName(name);
        var created=admins.register(input);
        db.update("INSERT INTO aster_staff(admin_id,role) VALUES(?,?)",created.getId(),role);
    }
}
