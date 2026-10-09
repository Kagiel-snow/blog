---
title: 无线局域网的通信原理与安全机制
date: '2026-10-09T11:10:00+09:00'
updated: '2026-10-09T11:10:00+09:00'
lang: zh-CN
translation_key: wireless-lan-radio-access-security
permalink: posts/wireless-lan-radio-access-security/
published: true
description: 从无线电波、IEEE 802.11 和 CSMA/CA 出发，系统整理无线局域网的组织方式、安全机制及 RFID、NFC、蓝牙、Zigbee、蜂窝网络与物联网通信，并配有计算例题和练习解答。
cover: /img/covers/network-starry-night.jpg
tags:
  - 学习笔记
  - 计算机网络
categories:
  - 边学边记
---

无线局域网（Wireless Local Area Network，WLAN）通过无线介质连接一定区域内的设备。理解它，需要同时考察三个层面：物理层如何把信息转换为无线信号，介质访问控制层如何协调多个发送者，以及安全机制如何认证设备并保护传输内容。IEEE 802.11 系列构成常见无线局域网的技术基础，Wi-Fi 则是与相关互操作认证和产品生态相联系的名称。

本文先建立 LAN、以太网与无线局域网之间的关系，再解释无线电、802.11 标准、CSMA/CA 和无线安全，最后将其放入个人区域网、蜂窝网络与物联网的技术体系。文中的峰值速率、通信距离和低延迟能力都应结合实现条件理解，不能直接作为具体设备的实际性能。

<!-- more -->

## 一、从局域网与以太网理解无线通信

### 1. LAN、WAN 与互联网

局域网（Local Area Network，LAN）通常连接住宅、教室、办公室或园区内的设备。广域网（Wide Area Network，WAN；<span lang="ja" translate="no">広域ネットワーク</span>）则跨越更大的地理区域，连接不同地点的网络。地理范围是一个重要维度，但不能用“是否超过某个固定公里数”作为所有场景中的唯一判据，网络管理、连接方式和服务范围同样有意义。

LAN 可以采用以太网，也可以采用无线局域网。因而，“局域网”不等于“网线网络”，“无线网络”也不等于“互联网”。互联网是大量网络通过共同协议互联形成的系统。

```text
家庭 LAN：手机 ── Wi-Fi ── AP ── 以太网 ── NAS
                         │
                       路由器
                         │
                     运营商 WAN
                         │
                       互联网
```

如果外部互联网连接中断，只要家庭内部的地址、权限和连接正常，手机仍可能访问 NAS。断开 WAN，并不自动意味着 LAN 内部不能通信。

### 2. MAC 地址与帧的交付

MAC 地址（Media Access Control Address；<span lang="ja" translate="no">MACアドレス</span>）用于链路层寻址。以太网和常见 802.11 网络使用 48 位 MAC 地址，通常写成六组十六进制数，例如 `02:11:22:33:44:55`。地址属于网络接口层面的标识，并不等同于用户身份，也不一定永久固定：设备可以使用本地管理地址或为隐私而随机化地址。

假设 A 向 B 发送一个单播帧，帧中包含目的 MAC 地址 B。接收端根据帧的地址、类型和接收规则判断是否交给上层，而不是把接收到的每个信号都当作自己的数据。

在早期共享同轴电缆或集线器环境中，一个发送者的信号可到达共享介质上的其他接口。在现代交换式以太网中，交换机学习源 MAC 与端口的关系，再按目的 MAC 转发；未知单播和广播等情况仍可能需要泛洪。因此，“所有计算机都收到所有以太网帧”只适合描述特定共享介质环境，不能概括所有以太网。

### 3. CSMA/CD 的历史适用范围

CSMA/CD 的全称是 Carrier Sense Multiple Access with Collision Detection，即载波侦听多路访问／碰撞检测。对应日语术语包括 <span lang="ja" translate="no">搬送波検知</span>、<span lang="ja" translate="no">多重アクセス</span> 和 <span lang="ja" translate="no">衝突検出</span>。

在传统半双工共享以太网中，基本过程为：

1. 发送前侦听介质，忙则推迟发送。
2. 满足发送条件后开始发送，并在发送过程中检测碰撞。
3. 检测到碰撞后执行规定的碰撞处理，停止本次正常帧发送。
4. 按截断二进制指数退避规则随机等待，再次尝试。

侦听不能完全排除碰撞，因为信号传播需要时间。两个接口可能在尚未听到对方信号时同时开始发送。随机退避（Backoff；<span lang="ja" translate="no">バックオフ</span>）打破了双方同时重试的对称性；若总在相同时间立即重发，就可能反复碰撞。

现代交换式以太网的点对点链路通常工作在全双工模式，允许双方同时发送和接收，**不使用 CSMA/CD**。因此，准确的比较对象是“传统共享半双工以太网与无线竞争接入”，不能简化成“所有有线网络用 CD，所有无线网络用 CA”。[Cisco 对以太网半双工与全双工的说明](https://www.cisco.com/en/US/docs/internetworking/troubleshooting/guide/tr1904.html)明确区分了这两种工作方式。

## 二、无线局域网如何组织设备

### 1. 基础设施模式与 AP

基础设施模式（Infrastructure Mode；<span lang="ja" translate="no">インフラストラクチャーモード</span>）通过无线接入点（Access Point，AP；<span lang="ja" translate="no">アクセスポイント</span>）组织终端接入。终端称为站点（Station，STA），AP 和关联到它的站点构成基础服务集（Basic Service Set，BSS）。

```text
手机 STA ── 无线链路 ── AP ── 有线网络
                         │
电脑 STA ── 无线链路 ────┘
```

普通基础设施通信中，同一 AP 下的手机与电脑通常经 AP 转发数据；某些标准扩展允许特定条件下的终端直连，不能把“所有终端数据永远只能经 AP”当作绝对规则。若启用了客户端隔离，即使两个终端连接相同 SSID，也可能不允许互访。

多个 BSS 可以通过分布式系统（Distribution System，DS）互联，形成扩展服务集（Extended Service Set，ESS）。校园里的多个 AP 可以使用相同的网络名称，但各自的 BSS 仍有不同的标识。

AP 的基本职责是提供无线接入和链路层连接。家用“无线路由器”常把 AP、以太网交换机、IP 路由、地址分配以及其他功能组合在一个设备中。AP 与路由器是不同的功能概念，不宜仅因它们装在同一外壳中就混为一谈。

### 2. 传统 Ad Hoc 与 Mesh 的区别

传统 802.11 Ad Hoc 模式（<span lang="ja" translate="no">アドホックモード</span>）对应独立基础服务集（Independent Basic Service Set，IBSS）：站点不依赖 AP，在可直接通信的范围内交换帧，IBSS 本身不提供通往 DS 的接入。[Microsoft 对 BSS 类型的定义](https://learn.microsoft.com/en-us/windows/win32/api/wlanapi/ns-wlanapi-wlan_bss_entry)可用于辨别基础设施 BSS 与 IBSS。

```text
传统 IBSS：A ↔ B                 需要直接可达
多跳 Mesh：A ↔ M1 ↔ M2 ↔ B       需要转发和路径选择机制
```

“自组织网络”在广义研究中可以包含多跳转发，但**传统 802.11 IBSS 并不自动等于多跳 Mesh**。要让 A 的数据经 M1、M2 到达 B，需要额外的转发与路径选择能力。IEEE 802.11s 针对网状拓扑中的路径配置和多跳通信作出了扩展，其范围见 [IEEE 802.11 工作组概览](https://www.ieee802.org/11/overview.html)。

| 比较项目 | 基础设施 BSS | 传统 IBSS | 无线 Mesh |
| --- | --- | --- | --- |
| AP 是否参与终端接入 | 是 | 不依赖 AP | 取决于网络设计，常有 AP 和网状节点 |
| 基本通信组织 | 终端关联到 AP | 站点直接互联 | 节点间建立路径并转发 |
| 是否天然意味着多跳 | 否 | 否 | 多跳是其重要能力 |
| 常见用途 | 住宅、校园、企业接入 | 临时直连网络 | 扩展覆盖、无线回传 |

Wi-Fi Direct、手机热点、IBSS 与 Mesh 也不应混用。它们都可能表现为“附近设备无线连接”，但组织、发现与连接机制不同。

## 三、无线电波、频率与波长

### 1. 电磁波怎样承载数字信息

无线电波（Radio Wave；<span lang="ja" translate="no">電波</span>）是电磁波的一部分。电磁波由变化的电场与磁场共同描述；在真空中的平面波模型下，两者相互垂直，并与传播方向垂直。电磁波的传播不需要空气，空气只是日常无线通信所处环境的一部分。

数字信息并不是以抽象的 0 和 1 直接漂浮在空间中。发送机根据比特序列产生特定信号波形，由天线辐射；接收机从接收到的波形中估计符号和比特。噪声、干扰、路径损耗及多径传播会使这个恢复过程出现误差。

### 2. 频率、周期与波长

频率（Frequency，f；<span lang="ja" translate="no">周波数</span>）表示每秒的周期数，单位是赫兹（Hz）。周期（Period，T）表示一个周期所用的时间；波长（Wavelength，λ；<span lang="ja" translate="no">波長</span>）表示同一时刻两个相邻同相位位置之间的空间距离。

```text
T = 1 / f
v = f × λ
λ = v / f

在真空中：v = c ≈ 3.00 × 10^8 m/s
在空气中进行入门估算时，通常也取 v ≈ c。
```

常用单位换算为：

```text
1 kHz = 10^3 Hz
1 MHz = 10^6 Hz
1 GHz = 10^9 Hz
```

2.4 GHz 表示每秒约 24 亿个周期。它描述载波变化的时间尺度，不表示每秒传输 24 亿个比特。

**例 1：计算三个无线频段的近似波长。**

```text
2.4 GHz：λ = (3.00 × 10^8) / (2.4 × 10^9)
               = 0.125 m = 12.5 cm

5.0 GHz：λ = (3.00 × 10^8) / (5.0 × 10^9)
               = 0.060 m = 6.0 cm

6.0 GHz：λ = (3.00 × 10^8) / (6.0 × 10^9)
               = 0.050 m = 5.0 cm
```

在传播速度相同时，频率越高，波长越短。频率从 2.4 GHz 升高到 5 GHz，并不意味着传输速度必然提高到原来的 5/2.4 倍。

### 3. 传播条件与“隔墙能力”

实际传播包括反射、绕射、散射和吸收。波长、障碍物尺寸、材料、电磁特性、天线、发射功率与接收灵敏度共同决定链路质量。在其他条件相近时，较低频段往往有覆盖方面的优势，但“2.4 GHz 一定穿透所有墙体，5 GHz 一定不能穿墙”并不成立。

2.4 GHz 与 5 GHz 的体验差异还可能来自频段拥塞、信道宽度、相邻网络以及设备能力。近距离连接 5 GHz 更快，未必只是因为载频更高；它可能使用了更宽信道、更高调制阶数或较少干扰。Bluetooth SIG 对[无线距离决定因素](https://www.bluetooth.com/learn-about-bluetooth/key-attributes/range/)的解释也强调功率、天线、接收灵敏度和环境共同影响覆盖。

## 四、基带、通带与调制

### 1. 基带传输和频带传输

基带信号（Baseband Signal；<span lang="ja" translate="no">ベースバンド信号</span>）是尚未搬移到射频载波附近的信息信号。基带传输直接利用相应的基带波形进行通信，线路编码可以采用 NRZ、双极性 AMI 或 Manchester 等形式。

NRZ 可以通过不同电平表示比特；AMI 对相应符号使用交替极性脉冲；Manchester 利用比特间隔内的电平转换兼顾数据表示与时钟恢复。它们不是同一种编码，也不能一律概括成“1 为高电平、0 为低电平”。

频带或通带传输（Passband Transmission）利用调制把信号搬移到某个载频附近。旧式通信教材中的 Broadband Transmission（<span lang="ja" translate="no">ブロードバンド伝送</span>）经常用于与 Baseband 对照，但“宽带”在不同语境下还可以指宽频谱或高速接入服务，需要结合上下文解释。

**基带不等于有线，通带不等于无线。** 无线系统内部也有基带处理，有线系统也可以采用载波调制，例如某些同轴电缆接入系统。物理介质和信号频谱的分类是两个维度。

### 2. 振幅、频率与相位

一个简化的正弦载波可以写成：

```text
s(t) = A × cos(2πft + φ)

A：振幅，描述波形的幅度
f：频率，描述单位时间内的周期数
φ：相位，描述波形相对于参考的周期位置
```

| 改变的属性 | 模拟调制名称 | 数字调制的基本例子 | 理解要点 |
| --- | --- | --- | --- |
| 振幅（Amplitude；<span lang="ja" translate="no">振幅</span>） | AM，Amplitude Modulation | ASK，Amplitude Shift Keying | 用不同幅度表示状态 |
| 频率（Frequency） | FM，Frequency Modulation | FSK，Frequency Shift Keying | 用不同频率表示状态 |
| 相位（Phase；<span lang="ja" translate="no">位相</span>） | PM，Phase Modulation | PSK，Phase Shift Keying | 用不同相位表示状态 |

QAM（Quadrature Amplitude Modulation）结合正交分量的幅度变化，在信号星座中形成多个可区分状态。对于常用的 M = 2ᵏ 阶调制，每个符号可以映射 k = log₂M 个比特，例如 16-QAM 对应 4 比特，64-QAM 对应 6 比特。这种固定长度比特标记要求 M 为 2 的幂，并不要求各符号等概率；它也不等同于扣除编码和其他开销后的净数据率。更高阶调制可以提高每个符号承载的比特数，但状态之间更难区分，因而需要更好的信号质量。

### 3. 载频、信道带宽、数据速率是不同量

载频以 Hz 表示“信号位于频谱的哪个位置”；信道带宽以 Hz 表示“占用多宽的频率范围”；数据速率以 bit/s 表示“单位时间传递多少比特”。例如，“5 GHz 频段中的 80 MHz 信道，当前 PHY 速率为 866.7 Mbit/s”包含三个不同的量。

更宽信道、更多空间流和更高阶调制都可能提高名义速率，但还受信噪比、编码、协议开销和法规限制。不能把 GHz 与 Gbit/s 直接等同。

## 五、IEEE 802.11 标准与速率条件

### 1. 经典标准表

IEEE（Institute of Electrical and Electronics Engineers）制定了大量通信标准。IEEE 802.3 是以太网标准体系，IEEE 802.11 是无线局域网标准体系。日语中的 <span lang="ja" translate="no">規格</span> 表示标准或技术规范。

下表中的速率是特定能力组合下的名义物理层速率，不是每台设备的下载速度，也不是应用层吞吐量。

| 标准 | 常见工作频段 | 经典名义峰值 | 理解条件 |
| --- | --- | ---: | --- |
| 原始 IEEE 802.11 | 2.4 GHz 射频实现 | 2 Mbit/s | 早期标准；原始标准也定义过红外物理层 |
| IEEE 802.11a | 5 GHz | 54 Mbit/s | 采用 OFDM 的经典标准 |
| IEEE 802.11b | 2.4 GHz | 11 Mbit/s | 经典高率直序扩频方案 |
| IEEE 802.11g | 2.4 GHz | 54 Mbit/s | 保留与 2.4 GHz 旧设备的兼容考虑 |
| IEEE 802.11n，Wi-Fi 4 | 2.4 GHz 或 5 GHz | 600 Mbit/s | 40 MHz、4 条空间流、400 ns 短保护间隔及相应最高 MCS |
| IEEE 802.11ac，Wi-Fi 5 | 5 GHz | 约 6.9 Gbit/s | 160 MHz、8 条空间流、256-QAM、相应编码与短保护间隔 |

802.11n 的 600 Mbit/s 条件见 [Cisco 的 802.11n 速率资料](https://www.cisco.com/c/dam/global/en_ca/training-events/pdfs/Next_Generation_Wireless_Solutions-Atlantic-Spring08-Customers.pdf)。802.11ac 的频段、信道宽度、空间流与峰值范围可参见 [Cisco 的标准对照资料](https://www.cisco.com/c/dam/global/hr_hr/assets/ciscoconnect/2013/pdfs/Cisco_Small_Cell_Architecture_Patrice_Nivaggioli_Consulting_System_Engineer_SP_EMEAR.pdf)。原始标准的射频与红外物理层范围见 [IEEE 工作组概览](https://www.ieee802.org/11/overview.html)。

a 与 g 都有 54 Mbit/s 的经典峰值，但工作频段不同；b 的峰值是 11 Mbit/s。标准字母并不是单纯的性能排名。

### 2. 802.11n 为什么更快

802.11n 的重要改进包括 MIMO（Multiple Input Multiple Output，多输入多输出）、较宽信道、较短保护间隔以及帧聚合等。空间复用可以在合适的信道条件下，通过多个空间流同时传输不同数据。

“支持 2.4 GHz 和 5 GHz”表示该标准可以在这些频段工作，**不表示把两个频段简单相加就得到 600 Mbit/s**。单次传统 802.11n 链路使用所选频段和信道，其速率由双方协商的能力及信道条件决定。

如果一个 AP 支持 4 条空间流，而手机只支持 1 条，AP 的最大能力不会自动转变成手机的最大能力。双方可共同使用的能力才决定这条连接的上限。

### 3. Wi-Fi 6、6E 与 7 的延伸

| 名称 | 对应技术 | 主要学习点 |
| --- | --- | --- |
| Wi-Fi 6 | IEEE 802.11ax | OFDMA、上下行多用户能力、1024-QAM，以及高密度环境下的效率改进 |
| Wi-Fi 6E | 将 Wi-Fi 6 能力扩展到 6 GHz | 使用 6 GHz 需要当地法规允许及双方设备支持 |
| Wi-Fi 7 | IEEE 802.11be | 320 MHz 信道、4096-QAM、多链路操作 MLO 等能力 |

Wi-Fi 6 的常见理论上限约为 9.6 Gbit/s，涉及 160 MHz、8 条空间流等条件；这不是普通手机的必然速率。[Cisco 的 802.11ax 技术说明](https://www.cisco.com/c/en/us/products/collateral/wireless/white-paper-c11-740788.html)解释了其空间流、调制和多用户能力。

Wi-Fi 7 的具体设备可能只实现标准能力的一个子集。举例而言，[Intel BE200 官方规格](https://www.intel.com/content/www/us/en/products/sku/230078/intel-wifi-7-be200/specifications.html)列出的 2×2、320 MHz、4096-QAM 组合标称最大速率约为 5.8 Gbit/s。理解新一代标准时，应读取信道宽度、空间流与终端实现，不能把某个极限组合的速率贴到所有产品上。MLO 也不是早期双频路由器的同义词。

### 4. 从名义速率到实际吞吐量

实际有效吞吐量会扣除前导、MAC 头、确认、帧间隔和竞争等待等开销，还可能受重传、干扰、其他站点争用、上行出口、服务器和应用限制。802.11 的共享信道不能理解为“每个接入者都独占宣传的峰值”。

**例 2：bit/s 与 byte/s 的换算。**

```text
1 byte = 8 bit
600 Mbit/s ÷ 8 = 75 MB/s
```

75 MB/s 只是把同一名义速率换成十进制字节单位，并没有扣除开销。它不是“600 Mbit/s Wi-Fi 必定达到的文件下载速度”。MB/s 与 MiB/s 也不相同，后者使用 2 的幂定义单位。

## 六、CSMA/CA 如何协调共享无线信道

### 1. 无线发送为什么不采用传统碰撞检测

CSMA/CA 的全称是 Carrier Sense Multiple Access with Collision Avoidance，即载波侦听多路访问／碰撞避免；<span lang="ja" translate="no">衝突回避</span> 对应 Collision Avoidance。

普通无线接口在发送时，自己的强发射信号会妨碍同时接收微弱信号，难以像传统共享以太网一样直接检测碰撞。无线覆盖还具有空间差异：A 听不到 C，并不意味着 A、C 的信号不会同时到达 B。

因而，802.11 的基本竞争机制着重于发送前的侦听、等待和随机退避，再利用适当的确认机制判断一次交换是否完成。“避免”表示降低碰撞概率，**并不表示碰撞绝不会发生**。

### 2. 物理侦听、虚拟侦听与 NAV

站点判断介质是否可用，不能只看是否检测到当前无线能量，还要考虑虚拟载波侦听。网络分配向量（Network Allocation Vector，NAV）根据收到帧中的持续时间等信息，记录介质被预约占用的剩余时间。

```text
物理侦听：目前是否检测到占用信道的信号？
虚拟侦听：NAV 是否表示当前仍应推迟发送？

任一项表明介质忙 → 按规则推迟竞争发送
```

NAV 是对后续交换所需时间的预约估计，不是“检测到了碰撞”的标志。物理与虚拟侦听、ACK 以及帧间隔的关系见 [Cisco 的 802.11 MAC 机制说明](https://www.cisco.com/E-Learning/bulk/guest/celc/fwl/ch2/2_2_3/content.html)。

### 3. 基本 DCF 竞争过程

分布式协调功能（Distributed Coordination Function，DCF）是理解 802.11 竞争访问的基础。下面以存在竞争、需要进行退避的一次典型单播发送为例：

1. 站点有待发送帧，先根据物理侦听和 NAV 判断介质状态。
2. 等待介质满足规定的空闲帧间隔，例如基本 DCF 中的 DIFS。
3. 从竞争窗口内选择随机整数退避计数器。常用表示为从 0 到 CW 中选择一个整数 N。
4. 信道持续空闲时，每经过一个退避时隙，计数器递减。
5. 若中途发现介质忙，**冻结剩余计数器**；重新满足空闲条件后继续递减。
6. 计数器到零时发送数据。普通需要确认的单播交换中，接收者正确接收后等待 SIFS，再发送 ACK。
7. 若没有在规定时间内收到预期确认，则按重试规则处理；竞争窗口通常扩大至规定上限，并再次竞争。达到重试限制后可能放弃该帧。

```text
空闲帧间隔 → 随机退避 → DATA → SIFS → ACK
                 │
           检测到忙则冻结
                 │
         再次空闲后继续计数
```

不能把这个过程压缩成“只要空闲就立即发”，也不宜断言“每一帧发送前都必须重新抽取一次随机数”。协议还存在已经完成的退避、发送后退避以及其他状态条件。上述流程用于说明竞争的核心行为，完整状态机比这个示意更细致。

SIFS 比 DIFS 短，使 ACK、CTS 等属于当前交换的响应能先于新的普通竞争发送获得机会。否则，接收方刚准备确认，其他站点就开始竞争，交换过程难以连续完成。

现代 802.11 网络还会使用 EDCA、AIFS、TXOP、Block ACK、OFDMA 调度等机制，具体帧交换并不都等于最基本的 DCF 示意；但侦听、退避、确认和共享资源协调仍是理解它们的起点。[Cisco 的 MAC 架构资料](https://www.cisco.com/E-Learning/bulk/guest/celc/fwl/ch2/2_2_2/content.html)介绍了基本 DCF 及其适用模式。

### 4. 退避为什么要冻结

假设 A、B、C 在同一轮竞争中分别选到 1、4、7 个时隙。经过一个空闲时隙后，A 的计数器到零，开始发送；B、C 的剩余计数分别为 3、6。B、C 检测到 A 占用介质，暂停计数。A 的交换结束、介质重新满足空闲条件后，B、C 才从剩余值继续计数。

如果 B 在信道忙时仍一路减到零并发送，就破坏了“空闲时隙才消耗退避计数”的规则。冻结也避免每次听到别人的发送就把已等待的时间全部丢失。

随机值可能相同，因此两个站点仍可能同时到零。重试时扩大竞争窗口有助于在负载较高时减少再次碰撞，但更大的窗口也增加等待时间，体现了效率与冲突概率之间的取舍。

### 5. ACK 确认了什么

ACK（Acknowledgment；<span lang="ja" translate="no">確認応答</span>或<span lang="ja" translate="no">確認信号</span>）表示某个需要确认的链路层帧交换得到了接收响应。它不是应用程序已经完成处理的证明，也不能替代端到端的可靠传输。

基本 802.11 的普通单播数据通常需要 ACK；普通广播和组播一般没有每个接收者立即返回的独立 ACK。聚合传输还可能使用 Block ACK，部分机制允许其他确认策略。所以“无线 LAN 中所有帧发送后都必须等待同一种 ACK”不成立。

缺少预期 ACK 只能说明发送者无法确认交换成功。可能原因包括数据帧碰撞、噪声造成数据损坏、接收者不可达，或数据已被正确接收但 ACK 本身丢失。发送者通常无法仅凭超时区分这些情况。

### 6. 隐藏节点与可选 RTS/CTS

隐藏节点（Hidden Node）是指两个发送者互相听不到，却能影响共同接收者的情况。

```text
A ───── 可达 ───── AP ───── 可达 ───── C
└──────────── A 与 C 互相听不到 ────────────┘
```

A 侦听到本地空闲时，C 也可能得到相同判断。两者同时发送，碰撞发生在 AP 附近，发送前的本地侦听没有识别出这种冲突。

RTS/CTS 可以在数据之前进行短控制帧交换：

```text
A → 接收方：RTS（Request To Send）
接收方 → 周围：CTS（Clear To Send）
A → 接收方：DATA
接收方 → A：ACK
```

能听到 CTS 的隐藏站点根据持续时间设置 NAV，从而推迟发送。RTS/CTS 是**可选机制**，会增加控制开销，并不保证消除所有碰撞。它的价值在于某些隐藏节点和长帧场景下，减少长数据帧直接冲突的损失。[Cisco 对无线控制帧的说明](https://www.cisco.com/c/en/us/support/docs/wireless-mobility/80211/200527-Fundamentals-of-802-11-Wireless-Sniffing.html)明确将 RTS/CTS 描述为可选功能。

### 7. 三种环境的对照

| 项目 | 传统共享半双工以太网 | 现代全双工交换以太网 | 基本 802.11 竞争接入 |
| --- | --- | --- | --- |
| 介质使用方式 | 多个站点共享 | 点对点链路，收发可同时进行 | 共享无线信道 |
| 关键访问机制 | CSMA/CD | 不使用 CSMA/CD | CSMA/CA，基本 DCF／相关增强机制 |
| 发送中的碰撞处理 | 直接检测并中止 | 没有同类共享介质碰撞 | 不采用传统 CD |
| 随机退避 | 用于碰撞恢复 | 不适用该机制 | 用于竞争与重试 |
| 链路层即时确认 | 无 802.11 式逐帧 ACK | 无 802.11 式逐帧 ACK | 普通需确认单播使用 ACK 等 |

## 七、无线局域网的识别、认证与加密

### 1. 安全目标与机制层次

无线信号可能到达房间之外，接入控制与内容保护必须明确设计。相关目标至少包括认证（Authentication；<span lang="ja" translate="no">認証</span>）、机密性（Confidentiality）、完整性（Integrity）和重放防护。

网络名称用于识别候选网络，密码或凭据参与认证与密钥建立，链路加密保护无线链路上的数据。这三类功能不能互相替代。一个看起来熟悉的 SSID，并不能独自证明 AP 可信。

### 2. SSID、ESSID 与 BSSID

SSID 的完整名称是 Service Set Identifier，即服务集标识。它通常呈现为用户看到的 Wi-Fi 网络名，如 `HomeWiFi` 或 `CampusNet`。ESSID 是在扩展服务集语境中使用的名称，并不是另一套比 SSID 更强的密码。

SSID 最长为 **32 个 octet，即 32 字节**，不是无条件允许 32 个中文字符，也不是标准层面只能使用英数字。[Microsoft 的 DOT11_SSID 文档](https://learn.microsoft.com/en-us/windows/win32/nativewifi/dot11-ssid)明确用字节表示长度，并说明最大值为 32。若使用 UTF-8，常见汉字通常占 3 字节，字符数和字节数就不同；具体设备界面还可能施加额外限制。

BSSID 用于区分具体 BSS，在常见基础设施网络中通常体现为 AP 相应无线接口的 MAC 地址。多个 AP 可以采用相同 SSID，但 BSSID 不同。SSID 是网络识别名，BSSID 更具体地指向某个 BSS。

名称中的 `5G` 也不能作为技术证据。例如 `HOME_5G` 可能仅表示路由器的 5 GHz Wi-Fi，不意味着手机正在使用第五代蜂窝网络。

### 3. 隐藏 SSID 的局限

隐藏 SSID（Hidden SSID；<span lang="ja" translate="no">ステルス機能</span>）通常指 AP 不在常见信标显示流程中公开网络名称，用户可能需要手动输入 SSID 才能连接。

该操作没有加密网络名称以外的数据，也没有建立可靠的用户认证。连接和管理过程仍可能暴露相关信息，因此不能把“列表里看不到名字”理解为“网络不可被发现”。它至多改变常规发现行为，不能替代 WPA2 或 WPA3。

### 4. MAC 地址过滤的局限

MAC 地址过滤（MAC Address Filtering；<span lang="ja" translate="no">MACアドレスフィルタリング</span>）根据接口地址执行允许或拒绝规则。允许名单的基本逻辑是：

```text
请求接口的 MAC 在允许名单中 → 满足该项接入规则
请求接口的 MAC 不在允许名单中 → 拒绝或不满足该项规则
```

MAC 地址不是具有密码学证明的身份凭据；地址可以被观察或伪装。它适合做辅助管理，不能单独承担强认证。终端的随机 MAC 功能也可能使预先登记的地址不匹配，造成正常用户无法接入。

隐藏 SSID 与 MAC 过滤都应归入较弱的辅助机制。研究旧式 WLAN 安全时，可参考 [NIST SP 800-97](https://www.nist.gov/publications/establishing-wireless-robust-security-networks-guide-ieee-80211i)对认证与稳健安全网络的系统说明；其中的历史背景不能当作当前产品功能的完整清单。

### 5. WEP、WPA、WPA2 与 WPA3

| 方案 | 英文全称或核心名称 | 主要技术与历史位置 | 应掌握的边界 |
| --- | --- | --- | --- |
| WEP | Wired Equivalent Privacy | 早期方案，采用 RC4 与短 IV | 存在结构性弱点，增加密钥长度不能修复其根本缺陷 |
| WPA | Wi-Fi Protected Access | 过渡方案，典型使用 TKIP 改进旧硬件上的保护 | WPA/TKIP 也是过时方案，不能因“会换密钥”就视为现代强安全 |
| WPA2 | Wi-Fi Protected Access 2 | 基于 802.11i，典型现代配置采用 AES-CCMP | 要区分认证方式、密码质量、设备修补与具体加密配置 |
| WPA3 | Wi-Fi Protected Access 3 | Personal 模式使用 SAE，并要求相关管理帧保护 | 提升口令认证保护，但仍需正确部署与终端支持 |

WEP 常见宣传中的“64 位”和“128 位”一般包含 24 位初始化向量（Initialization Vector，IV）：

```text
40 位秘密密钥 + 24 位 IV = 64 位组合输入
104 位秘密密钥 + 24 位 IV = 128 位组合输入
```

不能将整个 64 位或 128 位都理解为用户秘密密钥长度。WEP 的 IV 与 RC4 使用方式存在已知问题，所以“128 位 WEP 比 64 位长，因此已经足够安全”的推理不成立。这是历史机制分析，可参见 [NIST 的旧式 802.11 安全指南](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-48r1.pdf)。

WPA 的典型 TKIP 方案增加了每包密钥混合等保护，曾用于改进 WEP，但不能只用“密钥定期更新”概括其安全性。WPA2 常用的 CCMP 基于 AES（Advanced Encryption Standard，高级加密标准），同时提供相应的加密与完整性保护。

WPA2-Personal 通常使用共享口令；WPA2-Enterprise 使用 802.1X/EAP 体系进行用户或设备认证，能够按组织要求管理不同凭据。企业部署还要正确验证认证服务器，避免连接到冒充网络。WPA3-Personal 使用 SAE（Simultaneous Authentication of Equals），改善基于口令的认证，使被动捕获交换后的离线猜测受到更强限制；这并不意味着任意弱口令都没有风险。[HPE Aruba 的 WPA3-Personal 文档](https://arubanetworking.hpe.com/techdocs/aos/wifi-design-deploy/security/modes/wpa3-personal/)说明了 SAE、管理帧保护和过渡模式的关系。

“采用 AES 的无线安全方式”在 WEP、WPA/TKIP、WPA2 这组历史选项中通常指 WPA2，但不能脱离选项断言只有 WPA2 才使用 AES。WPA3 也不是完全抛弃了所有 AES 相关数据保护机制。

无线链路加密通常终止于 AP 或相应网络边界，不能代替应用层的 HTTPS 等端到端保护。已连接到加密 Wi-Fi，并不自动证明后续服务器可信或整个互联网路径都受同一种保护。

## 八、Wi-Fi 之外的无线通信技术

### 1. 按范围、功耗与用途分类

选择无线技术时，应先确定设备需要交换的数据量、频率、距离、移动性和能量预算。个人区域网（Personal Area Network，PAN）描述个人周围设备之间的连接范围；无线局域网适合区域接入；蜂窝网络和 LPWA 则常用于更广域的场景。这些范围存在重叠，并没有固定不变的距离分界。

| 技术 | 典型任务 | 范围与能量特征 | 不能直接等同的概念 |
| --- | --- | --- | --- |
| RFID | 识别标签、物流盘点、资产管理 | 依标签类型与频段而异，可近距离或较远读取 | RFID 不是单一固定距离的协议 |
| NFC | 贴近式支付、卡片与标签交互 | 厘米级近场交互 | NFC 不等于所有 RFID |
| 红外／IrDA | 遥控、历史近距离数据连接 | 受遮挡、朝向与光学条件影响 | 电视遥控协议不都属于 IrDA |
| Bluetooth Classic | 耳机、音箱、部分外设连接 | 2.4 GHz，适合个人设备通信 | 耳机用途不是所有 Bluetooth 的唯一用途 |
| Bluetooth LE | 传感器、手环、信标，以及新的音频能力 | 面向低能耗，支持多种通信组织 | BLE 不只是把经典蓝牙功率简单调低 |
| Zigbee | 智能家居、传感数据与控制 | 低数据量、低能耗，可构成 Mesh | Zigbee 不等于 IEEE 802.15.4 的全部内容 |
| LTE／5G | 移动宽带、广域蜂窝服务 | 运营商网络、移动性和广域覆盖 | 与 Wi-Fi 的 5 GHz 不是同一概念 |
| LPWA／LPWAN | 抄表、农业、城市与工业物联网 | 低功耗、广覆盖、通常较低数据率 | LPWA 是技术类别，不是唯一标准 |

### 2. RFID 的读写与标签供电

RFID 的全称是 Radio Frequency Identification，射频识别。系统通常包括标签（RF Tag；<span lang="ja" translate="no">RFタグ</span>或<span lang="ja" translate="no">ICタグ</span>）、读写器和后端处理系统。读写器利用无线电与标签交换标识或其他数据，不要求像光学条码那样必然看见标签表面。

无源标签（Passive Tag）从读写器的电磁场获得工作能量；有源标签（Active Tag）包含电池等能量来源。不同方案还可以使用不同频段，因此 RFID 并非都“只能读到几米”。通信距离受标签供电、天线、读写器、频段、安装材料和法规共同影响。[NIST 的 RFID 干扰研究介绍](https://www.nist.gov/ctl/rfid-interference-measurement)区分了这些频段与标签类型。

读取标签标识也不等于完成安全认证。仓库盘点只要求识别物品，与支付或门禁中的凭据认证有不同的安全需求。

### 3. NFC、Suica 与 NFC-F

NFC（Near Field Communication，近场通信；<span lang="ja" translate="no">近距離無線通信</span>）在 13.56 MHz 工作，通过近场交互完成贴近式通信，与 RFID 技术体系密切相关。常见用途包括读取标签、卡模拟、支付和近距离设备交互。其典型交互范围为厘米级，不能把“30 cm”当作所有手机 NFC 支付的通用距离。[NFC Forum 的技术说明](https://nfc-forum.org/learn/nfc-technology/)与 [Release 15 公告](https://nfc-forum.org/news/2025-06-nfc-forum-announces-nfc-release-15/)均强调贴近式范围及认证条件。

日本交通卡 Suica 使用 FeliCa 技术。FeliCa 与 NFC-F 使用相同的无线通信技术，而 FeliCa 在开放 NFC-F 基础上还包含卡片系统等功能。[Sony 对 NFC 与 FeliCa 关系的说明](https://www.sony.co.jp/en/Products/felica/NFC/relation.html)有助于区分底层通信与卡片应用；Suica 的应用背景可参见 [Sony 的 FeliCa 介绍](https://www.sony.co.jp/Products/felica/about/)。

因此，NFC、RFID、FeliCa 和 Suica 不能全部画等号：前两者涉及技术范围，FeliCa 是具体技术体系，Suica 是使用相关技术的交通与支付服务。手机具有某种 NFC 功能，也不必然支持所有交通卡应用。

### 4. 红外通信与 IrDA

红外通信（Infrared Communication；<span lang="ja" translate="no">赤外線通信</span>）利用红外光承载信息。电视遥控器是典型例子，但不同品牌和设备可能使用不同遥控编码，并不是所有遥控通信都采用 IrDA。

IrDA 是 Infrared Data Association，也常用于指该组织制定的红外数据通信规范体系。历史上用于计算机、手机及外设之间的近距离数据连接。典型早期全功率设计常以约 1 m 为量级，需要合适的朝向和无遮挡路径；实际距离依具体类别和实现而定。[Vishay 对 IrDA 术语与物理条件的说明](https://www.vishay.com/doc/?82512=)提供了相关光学背景。

红外通常不能像射频信号一样穿过不透明墙体，因此隔室连接受限制。另一方面，这种空间约束也可能减少跨房间的相互干扰。介质特性同时带来优点与限制。

### 5. Bluetooth Classic 与 Bluetooth LE

Bluetooth 在 2.4 GHz ISM 频段工作，常见于手机、电脑和个人外设之间的通信。Bluetooth Classic（BR/EDR）长期用于音频等连续数据业务；Bluetooth Low Energy（BLE 或 Bluetooth LE）从 Bluetooth 4.0 时代引入，面向很低的能耗和灵活连接需求。

BLE 常见任务包括心率与温度传感、手环数据、设备状态和信标广播。降低平均功耗的重要方法是让设备大部分时间休眠，只在必要时收发短数据。是否省电取决于连接间隔、发送频率、数据量、功率和固件实现，不能仅凭版本号断言所有设备都比上一代节能某个固定比例。

Bluetooth LE 可以支持点对点、广播以及相应的 Mesh 方案；LE Audio 也说明低功耗蓝牙的能力已不限于简单传感器。应区分“Bluetooth Classic 常用于耳机”和“所有耳机只能使用 Classic”这两种说法。[Bluetooth SIG 技术概览](https://www.bluetooth.com/learn-about-bluetooth/tech-overview/)介绍了 Classic 与 LE 两类无线方案。

蓝牙的可靠距离也不是固定 10 m。功率、PHY、接收灵敏度、天线和环境可能使距离明显变化，在设计与选型时应查看具体实现。

### 6. Zigbee 与 IEEE 802.15.4

Zigbee 面向低数据量的设备控制与传感通信，常见于温度传感器、门磁、照明和智能家居设备。它使用 IEEE 802.15.4 的物理层与 MAC 层，并在上面增加网络、应用与互操作等机制。因而，**IEEE 802.15.4 是 Zigbee 的底层基础，Zigbee 不是它的别名**。

典型 Zigbee 网络可包含协调器、路由器和终端设备。路由器参与消息转发，低功耗终端可以较多地休眠；不能假设每个用电池的终端都必须持续为邻居转发数据。Mesh 能扩大网络覆盖和提供路径选择，但网络中的常开节点、干扰和规划也影响效果。

Zigbee 并非只限于唯一频段，具体支持范围依规范与产品实现而定。相关协议层次见 [CSA 的互操作技术说明](https://csa-iot.org/wp-content/uploads/2021/12/04-2017-Interoperability-ORIGINAL-White-Paper-Final-Musa-and-Shashank-1.pdf)，产品体系见 [CSA Zigbee 官方介绍](https://csa-iot.org/all-solutions/zigbee/)。

把 Bluetooth 简记为外设、Zigbee 简记为传感器，有助于辨别常见用途，但两者实际应用有重叠。选择依据应当是拓扑、数据量、功耗和生态支持，而不是一个用途标签。

### 7. LTE、4G 与 5G

LTE 的全称是 Long Term Evolution，是 3GPP 的移动通信技术演进体系。手机经无线接入网络和运营商核心网络连接外部服务，与“连接一个局域 AP”的 WLAN 有不同的组织方式。

早期 LTE 与严格的 IMT-Advanced 标准之间存在历史命名差异，因而曾出现“3.9G”的说法；商业语境中 LTE 广泛被称为 4G。LTE-Advanced 则作为满足 IMT-Advanced 条件的方案得到认可。[3GPP 关于 LTE-Advanced 的公告](https://www.3gpp.org/news-events/3gpp-news/itu-r-confers-imt-advanced-4g-status-to-3gpp-lte)记录了这一历史背景。准确表述需要区分技术版本、标准要求与市场名称。

5G 是第五代移动通信系统（<span lang="ja" translate="no">第5世代移動通信システム</span>）。其典型能力方向为：

- eMBB（Enhanced Mobile Broadband，增强移动宽带）：面向更高数据速率与宽带业务。
- mMTC（Massive Machine-Type Communications，海量机器类通信）：面向大量设备与小数据业务，对应<span lang="ja" translate="no">多数同時接続</span>。
- URLLC（Ultra-Reliable and Low-Latency Communications，超可靠低延迟通信）：面向对可靠性和时延敏感的业务，对应<span lang="ja" translate="no">超低遅延</span>。

这三类业务方向见 [ITU 的 IMT-2020 网络工作说明](https://www.itu.int/ITU-T/workprog/wp_item.aspx?isn=17977)。它们是不同场景下的能力目标，并不表示一个普通手机连接能在所有时刻同时获得全部极限性能。

时延（Latency；<span lang="ja" translate="no">遅延</span>）表示处理或传送所用时间，吞吐量表示单位时间传递的数据量。大容量文件下载可能主要受吞吐量限制，而游戏操作反馈、远程控制等场景还明显受往返时延、抖动和丢包影响。无线接入时延较低，也不能保证整个应用端到端时延必然同样低：服务器位置、排队、核心网络与应用处理都会参与。

### 8. LPWA 的工程取舍

LPWA（Low Power Wide Area）或 LPWAN（Low-Power Wide-Area Network）是面向低功耗广域通信的一类技术。它通常以较低数据速率、较小消息和较低发送频率，换取更好的覆盖与电池寿命，适合抄表、土壤监测、环境检测或资产状态上报。

例如，农田温度传感器每小时只上报几十字节数据，不需要连续视频所需的高吞吐量。其主要约束可能是远距离连接、维护困难和长期电池供电。短距离 PAN 若需要大量中继节点，或 Wi-Fi 需要密集部署 AP，安装与维护成本可能较高；传统移动宽带模块的能耗和资费模式也可能不适合这类任务。LPWA 提供了不同的取舍，而不是无条件取代这些技术。

常见例子包括非授权频谱中的 LoRaWAN，以及授权频谱中的 NB-IoT 和 LTE-M。NB-IoT、LTE-M 属于 3GPP 标准化的蜂窝 LPWA 技术，见 [GSMA Mobile IoT 说明](https://www.gsma.com/solutions-and-impact/technologies/internet-of-things/gsma-mobile-iot-initiative/)。LoRa 与 LoRaWAN 也需要区分：前者涉及无线物理层调制，后者规定设备联网及相关协议，见 [LoRa Alliance 规范说明](https://resources.lora-alliance.org/home/lorawan-specification-v1-0-3)。

“数公里覆盖”和“电池使用多年”都属于可能实现的能力范围，需要结合环境、消息周期、重传、功率和设备待机电流评估。连续发送视频不符合典型低速 LPWA 的设计目标。

## 九、网络共享与边缘计算

### 1. Tethering 是连接共享功能

Tethering（<span lang="ja" translate="no">テザリング</span>）是让电脑等设备共享手机网络连接的功能。设备之间可通过 Wi-Fi 热点、USB 或 Bluetooth 等方式连接。

```text
笔记本 ── Wi-Fi／USB／Bluetooth ── 手机 ── LTE／5G ── 互联网
```

上图中，笔记本与手机之间的连接方式和手机的上游移动通信方式属于不同链路。若笔记本通过 Wi-Fi 使用手机的 5G 连接，不能说“笔记本因此直接变成了一个 5G 蜂窝终端”。手机承担连接共享与网关功能。

Tethering 也不等于 Bluetooth：Bluetooth 只是可能使用的一种局部连接技术。真正定义这项功能的是共享手机已有的网络访问能力。

### 2. Edge Computing 把处理放在哪里

边缘计算（Edge Computing；<span lang="ja" translate="no">エッジコンピューティング</span>）把部分计算放在靠近数据源或用户的位置，例如工厂网关、园区服务器或运营商接入边缘。

```text
传感器 → 边缘网关：过滤、汇总、异常识别、本地响应
                    ↓
                 云端：长期保存、跨地点分析、集中管理
```

边缘位置能够减少数据上传量或缩短部分处理路径，但效果取决于应用切分方式、边缘设备能力和部署位置。[ETSI 对边缘应用的说明](https://www.etsi.org/newsroom/press-releases/2250-new-etsi-white-paper-on-mec-support-for-edge-native-design-an-application-developer-perspective/)强调了把服务靠近用户的意义。

**例 3：本地平均值与上传量。** 假设传感器得到四个温度读数：

```text
21.001、21.004、21.006、21.002
平均值 = (21.001 + 21.004 + 21.006 + 21.002) / 4
       = 21.00325
保留三位小数：21.003
```

网关可以只上传某段时间内的平均值、最大值和异常，而不是上传每个采样点。若系统每秒产生 100 MB 原始数据，经本地处理后每秒上传 2 MB 摘要，则这组假设下的上传量减少 98%。这是数据处理策略的结果，不是“所有边缘计算都固定减少 98%”的规律。

对于障碍物检测等需要快速响应的任务，本地处理可以减少等待远端返回指令的时间；但安全关键系统仍需要满足自身可靠性与验证要求，不能仅以“部署在边缘”作为实时性能证明。

边缘处理还会带来软件更新、故障恢复、数据一致性和资源管理问题。过滤后的摘要可能无法替代原始数据的全部分析价值，必要时应结合缓存、抽样、异常原始片段上传等方式设计。

## 十、把技术对应到一个完整场景

一台手机在公寓中连接 `HOME_5G`：这个名称是 SSID，它可能对应 5 GHz 的 Wi-Fi。手机作为 STA 关联到 AP，构成基础设施 BSS；在基本竞争访问中，通过侦听和退避争用信道，普通需确认单播使用 ACK 等机制。无线安全由正确配置的 WPA2 或 WPA3 等机制提供，而不是由 SSID 名称或隐藏功能提供。

手机连接耳机时使用 Bluetooth；贴近支付终端时可能使用 NFC，具体支付应用还有独立的认证与交易流程；房间中的温度传感器可能使用 BLE 或 Zigbee。走出住宅后，手机可通过 LTE 或 5G 使用运营商网络。电脑共享这条上游连接时，使用的是 Tethering。

若把场景扩展到大范围农业监测，低频次小消息可能适合 LPWA。传感器附近的网关可先执行过滤或异常检测，这属于边缘计算。**接入技术回答数据如何传输，边缘计算回答部分数据在哪里处理**，二者处于不同维度。

## 十一、中日英术语与阅读关键词

### 1. 核心术语

| 中文 | 日语 | English |
| --- | --- | --- |
| 无线局域网 | <span lang="ja" translate="no">無線LAN</span> | Wireless LAN |
| 标准、规范 | <span lang="ja" translate="no">規格</span> | Standard |
| 无线接入点 | <span lang="ja" translate="no">アクセスポイント</span> | Access Point |
| 频率 | <span lang="ja" translate="no">周波数</span> | Frequency |
| 波长 | <span lang="ja" translate="no">波長</span> | Wavelength |
| 碰撞 | <span lang="ja" translate="no">衝突</span> | Collision |
| 碰撞检测 | <span lang="ja" translate="no">衝突検出</span> | Collision Detection |
| 碰撞避免 | <span lang="ja" translate="no">衝突回避</span> | Collision Avoidance |
| 随机退避 | <span lang="ja" translate="no">バックオフ時間</span> | Backoff Time |
| 确认应答 | <span lang="ja" translate="no">確認応答</span> | Acknowledgment |
| 丢弃 | <span lang="ja" translate="no">破棄する</span> | Discard |
| 加密方式 | <span lang="ja" translate="no">暗号方式</span> | Encryption Scheme |
| 认证 | <span lang="ja" translate="no">認証</span> | Authentication |
| 低延迟 | <span lang="ja" translate="no">低遅延</span> | Low Latency |
| 低功耗、节能 | <span lang="ja" translate="no">省電力</span> | Low Power |

### 2. 描述通信机制的日语动词

| 日语表达 | 中文含义 | 例句与解释 |
| --- | --- | --- |
| <span lang="ja" translate="no">～を介して</span> | 通过、经由 | <span lang="ja" translate="no">APを介して通信する。</span>通过 AP 通信 |
| <span lang="ja" translate="no">必要とせず</span> | 不需要 | <span lang="ja" translate="no">基地局を必要とせず通信する。</span>不依赖基站通信，仍需辨别具体网络模式 |
| <span lang="ja" translate="no">採用する</span> | 采用 | <span lang="ja" translate="no">AESを採用する。</span>采用 AES |
| <span lang="ja" translate="no">照合する</span> | 核对、比对 | <span lang="ja" translate="no">登録済みのMACアドレスと照合する。</span>与已登记的 MAC 地址比较 |
| <span lang="ja" translate="no">防止する</span> | 防止 | <span lang="ja" translate="no">不正アクセスを防止する。</span>防止未授权访问，需要结合机制判断实际保护强度 |
| <span lang="ja" translate="no">低減する</span> | 降低、减少 | <span lang="ja" translate="no">ネットワーク遅延を低減する。</span>降低网络时延 |
| <span lang="ja" translate="no">実現する</span> | 实现 | <span lang="ja" translate="no">低遅延通信を実現する。</span>实现低延迟通信，应留意其场景和条件 |

## 十二、概念辨析与术语练习

下列题目覆盖基础设施模式、接入机制、安全与其他无线技术。先根据技术含义作答，再用关键词核对，避免只靠名称记忆。

| 题号 | 问题 | 解答与条件 |
| --- | --- | --- |
| 1 | <span lang="ja" translate="no">基地局を介して通信する無線LANの構成は？</span> | 基础设施模式，Infrastructure Mode |
| 2 | 传统 802.11 中，不依赖 AP、站点直接通信的模式是什么？ | Ad Hoc／IBSS；不能由此直接推断支持多跳 Mesh |
| 3 | <span lang="ja" translate="no">無線LANで利用される基本的な競合アクセス方式は？</span> | CSMA/CA；基本 DCF 是理解起点 |
| 4 | 传统共享半双工以太网使用什么碰撞检测机制？ | CSMA/CD；现代全双工以太网不使用该机制 |
| 5 | 普通需要即时确认的 802.11 单播交换，用什么响应确认接收？ | ACK；缺 ACK 不能单独证明一定发生碰撞 |
| 6 | 在 WEP、WPA/TKIP、WPA2 选项中，典型采用 AES-CCMP 的方案是什么？ | WPA2；AES 并非只存在于 WPA2 |
| 7 | <span lang="ja" translate="no">SSIDを通常の一覧に表示させない機能は？</span> | 隐藏 SSID，<span lang="ja" translate="no">ステルス機能</span>；不是强认证或加密 |
| 8 | 预先登记终端 MAC，再比对并控制接入的机制是什么？ | MAC 地址过滤；地址可伪装，因此仅属辅助管理 |
| 9 | 802.11n 可以在哪些经典频段工作？ | 2.4 GHz 或 5 GHz；不代表传统链路把两频段简单相加 |
| 10 | 802.11ac 的工作频段是什么？ | 5 GHz |
| 11 | 利用无线电读取或写入 RF 标签信息的系统是什么？ | RFID；是否可写入还依标签功能与访问权限而定 |
| 12 | 与 RFID 相关、用于贴近式交互的技术是什么？ | NFC，典型为厘米级近场通信 |
| 13 | <span lang="ja" translate="no">イヤホンやキーボードなどの周辺機器接続に使われる通信技術は？</span> | Bluetooth；具体功能可能使用 Classic 或 LE |
| 14 | 以 IEEE 802.15.4 为底层基础、用于传感与控制的完整技术体系是什么？ | Zigbee；两者不是同义词 |
| 15 | <span lang="ja" translate="no">省電力・広範囲・比較的低速という特徴を持つIoT向け通信は？</span> | LPWA／LPWAN 技术类别 |
| 16 | <span lang="ja" translate="no">スマートフォンの通信機能をPCに共有する機能は？</span> | Tethering，<span lang="ja" translate="no">テザリング</span> |
| 17 | 在数据源附近处理部分数据，以减少上传量或缩短路径的架构是什么？ | Edge Computing，边缘计算；效果依具体部署与处理策略而定 |

若题目问“802.11g 的经典峰值速率”，回答 54 Mbit/s；若给出“5 GHz、54 Mbit/s”的经典标准组合，则对应 802.11a；给出“5 GHz、约 6.9 Gbit/s”的极限能力组合，则对应 802.11ac，而不是每台 ac 设备的保证吞吐量。

## 十三、计算与应用练习及解答

### 练习 1：频率与波长

某无线载波频率为 900 MHz，取传播速度为 3.00 × 10⁸ m/s，求波长。它的波长与 2.4 GHz 相比，哪个更长？

**解答：**

```text
λ = (3.00 × 10^8) / (900 × 10^6)
  ≈ 0.333 m = 33.3 cm
```

900 MHz 的波长更长。结论来自 λ = v/f，不代表该系统的实际通信距离必然是另一个系统的固定倍数。

### 练习 2：冻结的退避计数

三个站点的初始退避计数分别为 1、4、7。经过一个空闲时隙，第一个站点开始发送。第二和第三站点的计数是多少？在第一个站点发送期间，是否继续递减？

**解答：** 剩余计数分别为 3 和 6。检测到介质忙后冻结；待重新满足规定空闲条件，再从剩余计数继续。不是重新从 4、7 开始，也不是在忙时继续减到零。

### 练习 3：随机退避仍可能碰撞

假设两个站点独立、均匀地从 0 至 15 中选择退避计数，忽略其他影响。两者选到相同数值的概率是多少？

**解答：** 一个站点取值确定后，另一个站点有 16 个等可能值，其中一个相同。因此概率为 1/16，即 6.25%。这个简化概率只描述同轮抽取相同计数，不是整个真实 WLAN 的总碰撞概率。

### 练习 4：判断 ACK 丢失

A 向 B 发送数据，B 正确接收，但 A 没有收到 B 返回的 ACK。A 能否仅凭 ACK 超时断言 B 没有收到数据？

**解答：** 不能。对 A 而言，“数据未被 B 正确接收”和“数据已接收但确认丢失”都可能表现为 ACK 超时。链路层序号和重复检测等机制用于配合重传，避免把重复帧简单作为新数据交付。

### 练习 5：网络名与安全性

一个网络名为 `Campus_5G`，使用隐藏 SSID，并登记了 MAC 允许名单。能否据此判断它使用第五代蜂窝网络，且已经获得可靠的无线加密？

**解答：** 两个判断都不能成立。SSID 是用户可设置的名称，`5G` 可能只是 5 GHz Wi-Fi 的命名。隐藏 SSID 和 MAC 过滤也不提供可靠链路加密。需要查看实际接入技术与 WPA2／WPA3 等安全配置。

### 练习 6：为任务选择技术

分别给下列需求选择一个合理技术方向，并说明依据：手机连接耳机、贴近读取卡片、住宅门磁与照明控制、几公里范围低频上报土壤湿度、笔记本临时共享手机互联网连接。

**解答：**

1. 耳机可选择 Bluetooth，相应实现可能使用 Classic 或 LE Audio；关注音频能力、兼容性与功耗。
2. 贴近卡片交互可选择 NFC；若为 Suica 等应用，还需相应 NFC-F／FeliCa 与服务支持。
3. 门磁与照明可考虑 Zigbee，也可有其他可行方案；需配合网关、路由节点和设备生态。
4. 小消息、低频上报、广覆盖可考虑 LPWA，如 NB-IoT 或 LoRaWAN；需评估本地覆盖、网关和消息约束。
5. 共享手机互联网连接属于 Tethering；局部连接可用 Wi-Fi、USB 或 Bluetooth。

这些答案说明了合理方向，并不声称只有一种技术能够完成任务。

### 练习 7：边缘汇总的数据量

假设 10 000 个传感器每秒各产生 10 000 字节数据。云端直传的原始数据量是多少？若网关每秒为每个传感器只上传 200 字节摘要，减少了多少比例？均忽略协议开销。

**解答：**

```text
原始数据 = 10 000 × 10 000 B/s
         = 100 000 000 B/s = 100 MB/s

摘要数据 = 10 000 × 200 B/s
         = 2 000 000 B/s = 2 MB/s

减少比例 = (100 - 2) / 100 = 98%
```

减少上传量不意味着保留了原始数据中的所有信息。如果后续分析需要细节，应设计原始数据缓存、抽样或异常片段保存策略。

## 十四、复习时应保留的条件

无线局域网属于 LAN 技术，连接 Wi-Fi 不等于已经接入互联网。基础设施模式依赖 AP，传统 IBSS 不依赖 AP，但不自动提供多跳 Mesh。频率、波长、信道带宽与数据速率分别描述不同物理或通信量。

802.11 标准的峰值速率依赖信道宽度、空间流、调制编码和保护间隔等条件；CSMA/CA 通过侦听与退避减少冲突，普通单播利用确认判断交换是否完成，确认超时不能唯一确定失败原因。隐藏 SSID 与 MAC 过滤仅提供较弱辅助功能，不能替代现代认证与加密机制。

RFID、NFC、红外、Bluetooth、Zigbee、LTE、5G 与 LPWA 面向不同约束。技术选型应从数据量、时延、范围、功耗、移动性和基础设施条件出发。Tethering 描述网络共享功能，边缘计算描述处理位置；二者都不能简单归结为某个无线频段或单一通信协议。

## 参考资料

- [IEEE 802.11 工作组概览](https://www.ieee802.org/11/overview.html)：标准体系、历次扩展及其技术范围。
- [Cisco 的 802.11 MAC 机制说明](https://www.cisco.com/E-Learning/bulk/guest/celc/fwl/ch2/2_2_3/content.html)：载波侦听、NAV、链路确认与帧间隔。
- [NIST SP 800-97](https://www.nist.gov/publications/establishing-wireless-robust-security-networks-guide-ieee-80211i)：802.11i 与稳健安全网络的历史技术基础，应结合现代机制阅读。
- [Microsoft 的 DOT11_SSID 定义](https://learn.microsoft.com/en-us/windows/win32/nativewifi/dot11-ssid)：SSID 的字节长度与结构。
- [NFC Forum 技术介绍](https://nfc-forum.org/learn/nfc-technology/)：NFC 的频率、贴近式交互与相关能力。
- [Bluetooth SIG 技术概览](https://www.bluetooth.com/learn-about-bluetooth/tech-overview/)：Bluetooth Classic 与 Bluetooth LE。
- [CSA Zigbee 官方介绍](https://csa-iot.org/all-solutions/zigbee/)：Zigbee 的物联网技术体系与应用。
