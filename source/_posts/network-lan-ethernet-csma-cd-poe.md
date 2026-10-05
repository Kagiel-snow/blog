---
title: Network 笔记：LAN、以太网、CSMA/CD 和 PoE
date: '2026-10-02T18:00:00+09:00'
updated: '2026-10-02T18:00:00+09:00'
lang: zh-CN
translation_key: network-lan-ethernet-csma-cd-poe
permalink: posts/network-lan-ethernet-csma-cd-poe/
cover: /img/covers/network-starry-night.jpg
tags:
  - 计算机网络
  - 随手记
categories:
  - 边学边记
---

今天学了 Network 里面 LAN 这一块。连接结构、以太网、CSMA/CD，还有 PoE，先整理一下，之后忘了也方便回来翻。

## LAN 是什么

LAN 是 Local Area Network，也就是局域网。家里、教室、办公室里，把一小片范围内的设备连起来，就属于这类网络。

局域网不等于互联网。即使没接外网，里面的设备也可以在配置允许的情况下互相通信，比如访问局域网里的文件。

以太网和 Wi-Fi 都可以用来组成 LAN。LAN 说的是网络的范围，以太网说的是其中一种通信技术，这两个词先分开记。

## 连接结构，也就是拓扑

拓扑（Topology），先理解成设备之间怎么连接。

| 结构 | 怎么连接 | 先记住的特点 |
| --- | --- | --- |
| 总线型 Bus | 多台设备共用一条主干线 | 早期以太网用过，主干出问题会影响整段网络 |
| 星型 Star | 各台设备分别接到中心设备 | 现在用交换机连接电脑时很常见；单条接入线坏了通常只影响一台，中心设备故障影响更大 |
| 环型 Ring | 节点首尾相连成环 | 单环的一处故障可能中断通信；有冗余和保护机制时情况不同 |
| 树型 Tree | 分层连接，下面再接分支 | 可以看成多个星型往下扩展，常见于分层网络 |
| 网状 Mesh | 节点之间有多条连接 | 路径可以冗余，不过布线和管理更复杂；全网状是每两个节点都直连 |

再分两个说法：**物理拓扑看线怎么接，逻辑拓扑看数据怎样流动。**

比如旧式 Hub（集线器），线看起来接成星型，但大家仍然共享通信介质。换成交换机以后，各个端口对应独立的链路，不能只看图长得像，就认为工作方式也一样。

拓扑这部分参考：[IBM：Network topology](https://www.ibm.com/think/topics/network-topology)。

## 以太网 Ethernet

以太网对应 IEEE 802.3 系列标准，主要涉及物理层和数据链路层。常见的网线连接属于以太网，不过以太网也能用光纤，不能直接把它等同于某一种线。

这里先记三个东西：

- **帧 Frame**：以太网传输的数据单位，里面有源 MAC、目的 MAC 等字段。
- **MAC 地址**：以太网里通常是 48 位，也就是 6 字节，用于链路层寻址。
- **交换机 Switch**：根据收到的帧学习源 MAC 所在的端口，再根据目的 MAC 查表转发。

目的 MAC 还没学到时，普通交换机会在同一个 VLAN 内向其他可转发端口泛洪。广播帧也会在这个范围内转发，不能理解成交换机永远只发给某一台。

交换机学习和转发的说明：[Cisco：MAC address table](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst3750x_3560x/software/release/12-2_55_se/configuration/guide/3750xscg/swadmin.html)。

## CSMA/CD

这里是斜杠，写作 **CSMA/CD**。

全称是 Carrier Sense Multiple Access with Collision Detection，载波侦听多路访问／碰撞检测。

拆开记：

- CS：发送前先听一下线路有没有人在发。
- MA：多台设备共用介质，都有机会发送。
- CD：发送时还要检测有没有发生碰撞。

大概过程是：

1. 线路忙，就先等。
2. 线路空闲，按规则开始发送。
3. 检测到碰撞后，发送干扰信号（jam），停止这次帧的正常发送。
4. 随机等一段时间，再尝试。

为什么先听了还会碰撞？因为信号传播需要时间，两台设备可能几乎同时判断“现在没人发”，然后一起开始发送。

等待也不是每次固定多久，用的是截断二进制指数退避：连续碰撞越多，随机等待的取值范围会扩大，到规定上限为止。

**这个机制主要用于共享介质、半双工以太网。现代交换机的点对点全双工连接可以同时收发，不使用 CSMA/CD。** 所以不能记成“所有以太网都靠检测碰撞工作”。

半双工：同一时间不能同时收和发。全双工：可以同时收和发。

参考：[Cisco：传统以太网与全双工工作方式](https://www.cisco.com/en/US/docs/internetworking/troubleshooting/guide/tr1904.html)。

## PoE：网线还能供电

PoE 是 Power over Ethernet。一根铜缆在传数据的同时，也能给设备供电。无线 AP、网络摄像头、IP 电话里比较常见。

两个缩写：

- **PSE**：供电端，比如 PoE 交换机，或者单独的 PoE 注入器。
- **PD**：受电端，比如支持 PoE 的无线 AP。

符合 IEEE 标准的 PoE 会先检测接入设备，再按相应规则供电。普通以太网口不一定能供电，设备有网口也不代表它支持 PoE。

功率先放一个表，后面看设备规格时对照：

| 标准 | 类型 | 供电端最大功率 | 受电端对应可用功率 |
| --- | --- | ---: | ---: |
| 802.3af | Type 1 | 15.4 W | 13 W |
| 802.3at | Type 2 | 30 W | 25.5 W |
| 802.3bt | Type 3 | 60 W | 51 W |
| 802.3bt | Type 4 | 90 W | 71.3 W |

两边的数值不同，是因为线缆等会有损耗。表里是各类型最高功率等级对应的值，不代表插上就一直耗这么多电。

还要看交换机的**整机 PoE 预算**。单个口支持 30 W，不代表所有口都能同时给满 30 W。实际用之前要一起看设备要求、端口能力、总预算和线缆条件。

另外，标着“被动 PoE”的东西不能直接按上面这套标准判断兼容性，要核对电压和接线方式。

功率表参考：[Ethernet Alliance：PoE 技术说明](https://ethernetalliance.org/wp-content/uploads/2020/02/EthernetAlliance_Gen2PoECertProgram_techbrief-FINAL-19DEC19.pdf)。基础介绍：[Cisco：Power over Ethernet](https://www.cisco.com/site/us/en/learn/topics/networking/what-is-power-over-ethernet.html)。

今天先记这些。LAN 是什么范围，拓扑是怎么连接，以太网是怎么通信，PoE 则是在链路上加供电。CSMA/CD 要和半双工、共享介质放在一起理解。
