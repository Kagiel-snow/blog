---
title: 網站也會被擠得喘不過氣：聊聊 DDoS
date: '2026-08-16T21:20:00+09:00'
updated: '2026-10-01T00:00:00+09:00'
lang: zh-TW
translation_key: when-a-site-gets-crowded
permalink: posts/when-a-site-gets-crowded/
cover: /img/gallery/blue-evening.jpg
tags:
  - 資訊安全
  - 隨手記
categories:
  - 邊學邊記
source_revision: sha256:9c49f968b588ac967361d7a28c1e928e5d3cec230fec96a04b43b2d93331da05
---

有了自己的小站之後，再看到「網站打不開」，感覺就跟以前不太一樣了。以前可能直接關掉分頁，現在會忍不住想：是不是哪裡忙不過來？

這次想聊的是 DDoS，中文叫分散式阻斷服務攻擊。可以先把網站想成一家小店：有人從不同地方湧來，不斷佔著門口和店員的時間，真正想買東西的客人反而進不去。對網站來說，被消耗的可能是頻寬，也可能是處理請求的能力。

## 先別急著想成資料被偷

這個比喻幫我分清楚了一件事：服務被堵住，和資料外洩，不是同一個意思。光看網頁轉圈圈，不能判斷帳號是不是被盜。況且網站變慢也可能只是維護、網路出狀況，或突然來了很多訪客。

如果有一天小站卡住，我想先做的應該是看一下託管平台的狀態、記下出問題的時間，再了解流量有沒有異常。一直按重新整理，大概只會讓自己更緊張。

## 希望這個角落一直都在

做網站時很容易把心思放在封面和音樂上。不過，能讓人順利進來坐坐，本身也是一件重要的事。防護方式得配合實際環境，並沒有按下去就萬事沒問題的神奇按鈕。

今天先記到這裡。不求小站有多厲害，只希望想來的時候，它都還好好地開著門。

延伸閱讀：[Cloudflare 的 DDoS 入門介紹](https://www.cloudflare.com/learning/ddos/what-is-a-ddos-attack/)。

[Cloudflare 的白話說明](https://developers.cloudflare.com/learning-paths/prevent-ddos-attacks/concepts/ddos-attacks/)
