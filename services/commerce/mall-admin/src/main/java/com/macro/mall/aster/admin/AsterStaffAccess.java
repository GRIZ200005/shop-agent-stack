package com.macro.mall.aster.admin;

import com.macro.mall.common.api.ResultCode;
import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.security.Principal;
import java.util.Map;

/** Original Aster role check; no reliance on a browser menu or a token's role snapshot. */
@Service
public class AsterStaffAccess {
    private final JdbcTemplate db;
    public AsterStaffAccess(JdbcTemplate db) { this.db=db; }
    public Map<String,Object> require(Principal principal,boolean adminOnly) {
        if(principal==null) Asserts.fail(ResultCode.UNAUTHORIZED);
        var rows=db.queryForList("SELECT u.id,u.username,u.nick_name,s.role FROM ums_admin u JOIN aster_staff s ON s.admin_id=u.id WHERE u.username=? AND u.status=1",principal.getName());
        if(rows.isEmpty() || (adminOnly && !"ADMIN".equals(rows.get(0).get("role")))) Asserts.fail(ResultCode.FORBIDDEN);
        return rows.get(0);
    }
}
