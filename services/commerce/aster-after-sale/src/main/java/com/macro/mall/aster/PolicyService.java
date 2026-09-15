package com.macro.mall.aster;

import com.macro.mall.common.exception.Asserts;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Original Aster. MySQL is authoritative; publication and clause indexing commit together. */
@Service
public class PolicyService {
    private final JdbcTemplate db;
    public PolicyService(JdbcTemplate db) { this.db=db; }
    private static final String VISIBLE="p.status='PUBLISHED' AND m.visibility='CUSTOMER' AND m.index_status='READY' AND m.effective_from<=NOW(6) AND (m.effective_to IS NULL OR m.effective_to>NOW(6))";
    private static final String FIELDS="p.id,p.title,p.content,p.status,p.version,p.created_at,p.published_at,m.family_id,m.visibility,m.effective_from,m.effective_to,m.index_status";
    public List<Map<String,Object>> list(boolean staff) {
        return list(staff,0);
    }
    public List<Map<String,Object>> list(boolean staff,long before) {
        if(before<0) Asserts.fail("分页游标无效");
        return db.queryForList("SELECT "+FIELDS+",(SELECT COUNT(*) FROM aster_policy_clause c WHERE c.policy_id=p.id) clause_count FROM aster_policy p JOIN aster_policy_meta m ON m.policy_id=p.id WHERE "+(staff?"1=1":VISIBLE)+" AND (?=0 OR p.id<?) ORDER BY p.id DESC LIMIT 100",before,before);
    }
    @Transactional
    public long draft(String title,String content,long author,String visibility,Long previous) {
        if(title==null||title.isBlank()||title.length()>120||content==null||content.isBlank()||content.length()>20000) Asserts.fail("政策标题或正文长度不合法");
        if(!Set.of("CUSTOMER","STAFF").contains(visibility)) Asserts.fail("政策可见范围不合法");
        long family=0; int version=1;
        if(previous!=null) {
            var rows=db.queryForList("SELECT family_id FROM aster_policy_meta WHERE policy_id=?",previous);
            if(rows.isEmpty()) Asserts.fail("原政策不存在");
            family=((Number)rows.get(0).get("family_id")).longValue();
            db.queryForList("SELECT id FROM aster_policy WHERE id=? FOR UPDATE",family);
            version=db.queryForObject("SELECT MAX(p.version)+1 FROM aster_policy p JOIN aster_policy_meta m ON m.policy_id=p.id WHERE m.family_id=?",Integer.class,family);
        }
        db.update("INSERT INTO aster_policy(title,content,author_id,version) VALUES(?,?,?,?)",title.trim(),content.trim(),author,version);
        long id=db.queryForObject("SELECT LAST_INSERT_ID()",Long.class);
        db.update("INSERT INTO aster_policy_meta(policy_id,family_id,visibility) VALUES(?,?,?)",id,family==0?id:family,visibility);
        return id;
    }
    @Transactional
    public void publish(long id) {
        var metas=db.queryForList("SELECT family_id FROM aster_policy_meta WHERE policy_id=?",id);
        if(metas.isEmpty()) Asserts.fail("政策不存在");
        long family=((Number)metas.get(0).get("family_id")).longValue();
        db.queryForList("SELECT id FROM aster_policy WHERE id=? FOR UPDATE",family);
        var row=db.queryForMap("SELECT * FROM aster_policy WHERE id=? FOR UPDATE",id);
        if(!"DRAFT".equals(row.get("status"))) Asserts.fail("仅草稿可发布");
        int newer=db.queryForObject("SELECT COUNT(*) FROM aster_policy p JOIN aster_policy_meta m ON m.policy_id=p.id WHERE m.family_id=? AND p.version>? AND p.status IN ('PUBLISHED','SUPERSEDED','WITHDRAWN')",Integer.class,family,row.get("version"));
        if(newer>0) Asserts.fail("存在已发布过的更高版本，请新建修订");
        String content=row.get("content").toString();
        int no=0;
        for(String paragraph:content.split("\\R+")) {
            String text=paragraph.trim();
            for(int offset=0;offset<text.length();) {
                int end=Math.min(offset+900,text.length());
                if(end<text.length()&&Character.isHighSurrogate(text.charAt(end-1))) end--;
                String clause=text.substring(offset,end); offset=end;
                db.update("INSERT INTO aster_policy_clause(policy_id,clause_no,content,content_hash) VALUES(?,?,?,SHA2(?,256))",id,++no,clause,clause);
            }
        }
        if(no==0) Asserts.fail("政策没有有效条款");
        db.update("UPDATE aster_policy p JOIN aster_policy_meta m ON m.policy_id=p.id SET p.status='SUPERSEDED',m.effective_to=NOW(6) WHERE m.family_id=? AND p.status='PUBLISHED'",family);
        db.update("UPDATE aster_policy SET status='PUBLISHED',published_at=NOW() WHERE id=?",id);
        db.update("UPDATE aster_policy_meta SET effective_from=NOW(6),effective_to=NULL,index_status='READY' WHERE policy_id=?",id);
        enqueueIndex();
    }
    @Transactional
    public void withdraw(long id) {
        var rows=db.queryForList("SELECT family_id FROM aster_policy_meta WHERE policy_id=?",id);
        if(rows.isEmpty()) Asserts.fail("政策不存在");
        db.queryForList("SELECT id FROM aster_policy WHERE id=? FOR UPDATE",rows.get(0).get("family_id"));
        if(db.update("UPDATE aster_policy SET status='WITHDRAWN' WHERE id=? AND status='PUBLISHED'",id)!=1) Asserts.fail("仅已发布政策可撤回");
        db.update("UPDATE aster_policy_meta SET effective_to=NOW(6),index_status='WITHDRAWN' WHERE policy_id=?",id);
        enqueueIndex();
    }
    private void enqueueIndex() {
        db.update("UPDATE aster_knowledge_epoch SET revision=revision+1 WHERE id=1");
        db.update("INSERT INTO aster_policy_index_job(revision) SELECT revision FROM aster_knowledge_epoch WHERE id=1");
    }
    public Map<String,Object> indexState() {
        return Map.of("epoch",db.queryForObject("SELECT revision FROM aster_knowledge_epoch WHERE id=1",Long.class),
            "jobs",db.queryForList("SELECT * FROM aster_policy_index_job ORDER BY revision DESC LIMIT 10"));
    }
    @Transactional
    public void indexResult(long revision,boolean success,String collection) {
        long current=db.queryForObject("SELECT revision FROM aster_knowledge_epoch WHERE id=1 FOR UPDATE",Long.class);
        if(revision<0||revision>current||collection==null||!collection.matches("aster_live_[a-z0-9_]{1,120}")) Asserts.fail("索引结果不合法");
        db.update("UPDATE aster_policy_index_job SET status=?,attempts=attempts+1,collection_name=?,error_code=?,updated_at=NOW(6) WHERE revision=?",
            success?(revision==current?"READY":"SUPERSEDED"):"RETRY",collection,success?null:"INDEX_BUILD_FAILED",revision);
        if(success) db.update("UPDATE aster_policy_index_job SET status='SUPERSEDED',updated_at=NOW(6) WHERE revision<? AND status<>'SUPERSEDED'",revision);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> source(long id,int version) {
        var rows=db.queryForList("SELECT "+FIELDS+" FROM aster_policy p JOIN aster_policy_meta m ON m.policy_id=p.id WHERE p.id=? AND p.version=? AND "+VISIBLE,id,version);
        if(rows.isEmpty()) Asserts.fail("政策已失效或不可访问，请重新检索");
        var result=rows.get(0);
        result.put("clauses",db.queryForList("SELECT clause_no,content,content_hash FROM aster_policy_clause WHERE policy_id=? ORDER BY clause_no",id));
        return result;
    }
    @Transactional(readOnly=true)
    public Map<String,Object> catalog(long after) {
        if(after<0) Asserts.fail("分页游标无效");
        long epoch=db.queryForObject("SELECT revision FROM aster_knowledge_epoch WHERE id=1",Long.class);
        var rows=db.queryForList("SELECT c.id clause_cursor,c.policy_id,c.clause_no,c.content,c.content_hash,p.title,p.version,m.family_id FROM aster_policy_clause c JOIN aster_policy p ON p.id=c.policy_id JOIN aster_policy_meta m ON m.policy_id=p.id WHERE c.id>? AND "+VISIBLE+" ORDER BY c.id LIMIT 200",after);
        return Map.of("epoch",epoch,"items",rows,"next",rows.isEmpty()?after:rows.get(rows.size()-1).get("clause_cursor"),"more",rows.size()==200);
    }
}
