translate.js 3.5.1 (reports 3.5.1.20240609), Apache-2.0
Author: 管雷鸣
Upstream: https://github.com/xnx3/translate
Unmodified distribution: https://cdn.staticfile.net/translate.js/3.5.1/translate.js
Docs: https://translate.zvo.cn/41961.html and https://translate.zvo.cn/43086.html

The site's translation.js loads this pinned copy only on a translation request.
It calls request.post with explicit text arrays and client.edge; it does NOT call
execute/init/changeLanguage or enable the library's DOM/request observers.
This prevents page reloads, comment/form collection and remote initialization.
The public translation channel can change or become unavailable. The page keeps
its original Chinese text and offers retry. No API secret is bundled.
