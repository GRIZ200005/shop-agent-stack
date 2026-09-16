# 仓库来源与公开协作

本项目使用独立Git仓库，保留公开上游来源及修改记录。当前公开准备流程见[发布检查](public-release.md)，许可范围见根目录[LICENSE](../LICENSE)与[THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

## 本地与远程

从自己的仓库地址clone后，在VS Code中只打开项目根目录。不要把父级工作目录或无关项目一并跟踪。已有仓库不要再次初始化或重复绑定remote。

```powershell
git status --short
git remote -v
git config --get user.name
git config --get user.email
```

新贡献者按自己的身份配置Git；需要隐藏个人邮箱时使用本人账户提供的noreply地址，不复制其他人的元数据。远程URL不得包含token或密码。

## 提交前

查看暂存文件和差异，确认只包含当前任务的源代码、合成数据与授权素材。环境、运行数据库、截图、凭据和原始报告不进入Git。私有仓库不改变这些边界。

## mall来源

上游仓库及固定提交由THIRD_PARTY_NOTICES记录；对应许可证保存在`services/commerce/LICENSE`。保留原作者注释，对衍生文件标记修改，不宣称商品/会员/订单底座从零自研。本项目原创代码与文档已选择Apache-2.0；第三方依赖与资源遵循各自协议。

## 公开之前

检查全部历史、分支、tag、作者信息、删除过的文件与二进制资源。当前工作区删除不等于历史删除，也不要未经协调重写共享历史。改变GitHub可见性或推送发布是单独操作，本次文档整理没有执行。
