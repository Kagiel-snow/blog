---
title: 輸入框後面的小界線：聊聊 SQL 注入
date: '2026-09-06T20:40:00+09:00'
updated: '2026-10-01T00:00:00+09:00'
lang: zh-TW
translation_key: a-small-note-on-sql-injection
permalink: posts/a-small-note-on-sql-injection/
cover: /img/gallery/white-wings.jpg
tags:
  - 資訊安全
  - 隨手記
categories:
  - 邊學邊記
source_revision: sha256:823822580131154b8328942d26b9f2f2dfe403c3f2f6f11b8621a0e49736a7a0
---

搜尋歌曲、留一句話、填個暱稱，這些輸入框每天都會碰到。按下送出之後，通常就不會再多想。今天卻想停一下，看看輸入框後面發生的事。

程式和關聯式資料庫溝通時，常會用到 SQL。如果把使用者填的內容直接接進查詢語句，原本只是資料的文字，就可能變成指令的一部分。SQL 注入說的，便是這種界線被混在一起的問題。

## 讓內容待在它自己的格子裡

我喜歡把它想成一張表格：流程已經寫好，填寫的人只需要在固定欄位裡留下內容，不應該連整張表格的規則都能一起改掉。參數化查詢會把查詢結構和輸入值分開，也是 OWASP 建議的主要防護方法之一。

與其急著背一長串特殊字元，我更想先記住這件事：輸入是資料，不能隨便被當成指令。只有網頁上的輸入限制還不夠，真正處理資料的那一端，也得把界線顧好。

## 好奇心可以留在自己的練習區

學到這類東西，很容易想立刻試試看。不過，我會把練習留在自己建立的環境，不拿別人的網站當實驗品。慢慢搞懂一件事，也可以是一種樂趣。

這個部落格是靜態生成的，本身沒有因為寫了 SQL 文章，就多出一個查詢資料庫的介面。評論等外部服務則有各自的實作。先釐清資料實際在哪裡被處理，再討論風險，比看到輸入框就緊張有用。

今天的小筆記就先到這裡。看起來很普通的地方，也值得多想一下。

參考：[OWASP 的 SQL 注入防護說明](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)。

[PostgreSQL 的參數說明](https://www.postgresql.org/docs/current/sql-prepare.html)
