---
title: DDoS 是什么，记几个要点
date: '2026-08-16T21:20:00+09:00'
updated: '2026-10-02T18:00:00+09:00'
lang: zh-CN
translation_key: when-a-site-gets-crowded
permalink: posts/when-a-site-gets-crowded/
cover: /img/covers/ddos-rainy-city.png
tags:
  - 网络安全
  - 随手记
categories:
  - 边学边记
---

今天整理一下 DDoS 这个概念。

DDoS 的全称是 Distributed Denial of Service，中文叫分布式拒绝服务攻击。多个来源一起消耗目标的带宽、连接资源或处理能力，导致正常用户访问困难。

这里的“拒绝服务”说的是服务不能正常提供。单凭网站打不开，不能判断数据被偷了，也不能直接认定是 DDoS。

## 网站打不开时先看什么

先查托管平台有没有故障或维护，再看域名解析、自己最近的改动，以及能拿到的日志和流量记录。

访问量突然上涨、程序出错、网络故障，都可能导致卡顿。要结合现象判断，不能看到转圈就下结论。

## 防护先记个方向

可以根据托管环境使用平台提供的 DDoS 防护、CDN、限流等功能。它们各自能处理的情况不一样，也不是开了某个选项就能解决所有问题。

这个博客是静态站点，页面和评论服务还要分开看。页面打不开和评论加载失败，原因可能完全不同。

先记到这里。后面了解自己的托管平台能看哪些数据，再补具体的排查步骤。

参考：[Cloudflare：什么是 DDoS](https://www.cloudflare.com/learning/ddos/what-is-a-ddos-attack/)、[DDoS 基本概念](https://developers.cloudflare.com/learning-paths/prevent-ddos-attacks/concepts/ddos-attacks/)。
