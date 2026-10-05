---
title: SQL 注入，先记一下
date: '2026-09-06T20:40:00+09:00'
updated: '2026-10-02T18:00:00+09:00'
lang: zh-CN
translation_key: a-small-note-on-sql-injection
permalink: posts/a-small-note-on-sql-injection/
cover: /img/covers/sql-silver-wings.jpg
tags:
  - 网络安全
  - 随手记
categories:
  - 边学边记
---

最近在看 SQL 注入，先记一下它到底是怎么回事。

SQL 是用来操作关系数据库的语言。问题一般出在程序把用户输入直接拼进 SQL 语句里。这样一来，输入的内容就有可能改变原本的查询逻辑。

## 重点是参数化查询

写查询的时候，SQL 的结构和用户输入要分开。查询里留参数的位置，再通过数据库驱动绑定具体的值，不要自己用字符串拼接。

不过参数通常只能放数据值，表名、列名这类结构不能直接当参数传。需要动态选择时，可以在代码里列出允许的选项。

还有几个容易漏掉的地方：

- 前端限制输入不够，别人可以绕开页面直接发请求。
- 输入校验有用，但不能拿它代替参数化查询。
- 数据库账号只给需要的权限，不要所有操作都用管理员账号。

先记住这个：**用户输入是数据，不能让它变成 SQL 结构的一部分。** 后面写数据库相关代码时再对照着看。

参考：[OWASP：SQL 注入防护](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)、[PostgreSQL：PREPARE](https://www.postgresql.org/docs/current/sql-prepare.html)。
