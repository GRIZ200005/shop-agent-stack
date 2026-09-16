package com.macro.mall.shopagentstack;

import com.macro.mall.common.exception.Asserts;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Original ShopAgentStack human support. Customer supplied context is never business authority. */
@Service
public class SupportService {
    private final JdbcTemplate db;
    public SupportService(JdbcTemplate db){this.db=db;}
    private static String uuid(String value){try{return UUID.fromString(value).toString();}catch(Exception e){Asserts.fail("请求编号不合法");return null;}}
    private static String text(String value,int limit){if(value==null || value.isBlank() || value.length()>limit)Asserts.fail("请检查内容长度");return value.trim();}
    private Map<String,Object> ticket(String id,Long member,boolean lock){
        var rows=db.queryForList("SELECT * FROM shop_agent_stack_support_ticket WHERE id=?"+(member==null?"":" AND member_id=?")+(lock?" FOR UPDATE":""),member==null?new Object[]{uuid(id)}:new Object[]{uuid(id),member});
        if(rows.isEmpty())Asserts.fail("咨询不存在或无权访问");return rows.get(0);
    }
    public Map<String,Object> list(Long member,int page){
        if(page<0 || page>10000)Asserts.fail("页码不合法");
        String sql="SELECT id,title,status,assignee_id,created_at,updated_at FROM shop_agent_stack_support_ticket"+(member==null?"":" WHERE member_id=?")+" ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?";
        var rows=db.queryForList(sql,member==null?new Object[]{page*20}:new Object[]{member,page*20});
        return Map.of("items",rows.subList(0,Math.min(20,rows.size())),"more",rows.size()>20);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> detail(String id,Long member){
        var result=ticket(id,member,false);
        result.put("messages",db.queryForList("SELECT id,author_role,content,created_at FROM shop_agent_stack_support_message WHERE ticket_id=? ORDER BY seq LIMIT 200",id));
        return result;
    }
    @Transactional
    public Map<String,Object> create(long member,String requestId,String title,String context){
        String id=uuid(requestId),name=text(title,120),excerpt=context==null?"":context.trim();
        if(excerpt.length()>6000)Asserts.fail("会话摘录过长");
        try{db.update("INSERT INTO shop_agent_stack_support_ticket(id,member_id,title,context_text) VALUES(?,?,?,?)",id,member,name,excerpt);}
        catch(DuplicateKeyException e){var prior=ticket(id,member,false);if(!name.equals(prior.get("title")) || !excerpt.equals(prior.get("context_text")))Asserts.fail("重复请求内容已变化，请刷新后重试");}
        return detail(id,member);
    }
    @Transactional
    public void claim(String id,long staff){
        var row=ticket(id,null,true);
        if("IN_PROGRESS".equals(row.get("status")) && Objects.equals(((Number)row.get("assignee_id")).longValue(),staff))return;
        if(!"WAITING".equals(row.get("status")))Asserts.fail("咨询已被领取或已解决，请刷新");
        db.update("UPDATE shop_agent_stack_support_ticket SET status='IN_PROGRESS',assignee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",staff,id);
        system(id,staff,"客服已接手咨询。");
    }
    private void assigned(Map<String,Object> row,long staff){if(row.get("assignee_id")==null || ((Number)row.get("assignee_id")).longValue()!=staff)Asserts.fail("仅领取本咨询的客服可以处理");}
    private void system(String id,long staff,String content){db.update("INSERT INTO shop_agent_stack_support_message(id,ticket_id,author_id,author_role,content) VALUES(?,?,?,'SYSTEM',?)",UUID.randomUUID().toString(),id,staff,content);}
    @Transactional
    public void reply(String id,long actor,boolean staff,String requestId,String content){
        String mid=uuid(requestId),body=text(content,2000),role=staff?"STAFF":"CUSTOMER";
        var row=ticket(id,staff?null:actor,true);
        if(staff)assigned(row,actor);
        var prior=db.queryForList("SELECT * FROM shop_agent_stack_support_message WHERE id=?",mid);
        if(!prior.isEmpty()){
            var p=prior.get(0);
            if(!id.equals(p.get("ticket_id")) || !role.equals(p.get("author_role")) || ((Number)p.get("author_id")).longValue()!=actor || !body.equals(p.get("content")))Asserts.fail("重复请求内容不一致");
            return;
        }
        if("RESOLVED".equals(row.get("status")))Asserts.fail("咨询已解决，请新建咨询");
        if(db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_support_message WHERE ticket_id=?",Long.class,id)>=190)Asserts.fail("本咨询消息已达上限，请结束后新建咨询");
        db.update("INSERT INTO shop_agent_stack_support_message(id,ticket_id,author_id,author_role,content) VALUES(?,?,?,?,?)",mid,id,actor,role,body);
        db.update("UPDATE shop_agent_stack_support_ticket SET updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
    }
    @Transactional
    public void resolve(String id,long staff){
        var row=ticket(id,null,true);assigned(row,staff);
        if("RESOLVED".equals(row.get("status")))return;
        if(db.queryForObject("SELECT COUNT(*) FROM shop_agent_stack_support_message WHERE ticket_id=? AND author_role='STAFF'",Long.class,id)==0)Asserts.fail("请先回复客户再结束咨询");
        db.update("UPDATE shop_agent_stack_support_ticket SET status='RESOLVED',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);
        system(id,staff,"客服已将咨询标记为已解决。如有新问题，可新建咨询。");
    }
}
