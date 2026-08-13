# 🤖 ChatGPT Proxy on Vercel

واجهة عربية ذكية للاستخدام الشخصي لـ ChatGPT، مبنية بـ Next.js 14 وقابلة للنشر على Vercel.

## ✨ الميزات

- 🚀 **نشر فوري** - يعمل فوراً بعد النشر بدون إعدادات معقدة
- 🍪 **استيراد ذكي للكوكيز** - الصق كوكيز Chrome JSON أو Cookie Header مباشرة، يتعرف عليها تلقائياً
- 💾 **ربط تلقائي بـ Redis/KV** - يكتشف Upstash/Vercel KV تلقائياً عند ربطه من Storage
- ⚡ **بث مباشر** للردود (streaming)
- 💬 **محادثات متعددة الأدوار** (تتذكر السياق)
- 💡 **8 أمثلة جاهزة** لتجربة سريعة
- 🔒 **حماية كاملة** (JWT + API Key + Rate Limiting + Middleware)
- ⏱ **Cron تلقائي** لتحديث التوكن (يدعم Namecheap cPanel)
- 🎨 **واجهة عربية RTL** بتصميم نظيف

---

## 🚀 النشر (3 خطوات)

### 1. ارفع المشروع على GitHub → اربطه بـ Vercel

### 2. أضف متغير بيئي واحد فقط:

اذهب إلى **Vercel → Project → Settings → Environment Variables** وأضف:

| المفتاح | القيمة |
|---------|--------|
| `JWT_SECRET` | نص عشوائي طويل (مولّد) |

**الباقي اختياري ويمكن إعداده من لوحة الإدارة.**

### 3. Deploy!

بعد نجاح النشر:
1. اذهب إلى `/login` وسجّل الدخول بكلمة المرور الافتراضية: **`admin`**
2. في لوحة الإدارة، اضغط **"استيراد سريع"** والصق كوكيز ChatGPT
3. غيّر كلمة المرور الافتراضية
4. اضغط **"تحديث Access Token"**
5. ارجع إلى `/` وابدأ!

---

## 💾 ربط قاعدة البيانات (اختياري لكن يُنصح به)

**التطبيق يعمل بدون KV** (يستخدم ذاكرة مؤقتة). للربط التلقائي:

1. Vercel → مشروعك → **Storage**
2. **Create Database** → **Upstash Redis**
3. خطة Free → Create → اربط بالمشروع
4. **Redeploy**

سيكتشف التطبيق متغيرات `KV_REST_API_URL` و `KV_REST_API_TOKEN` تلقائياً ويتحول للتخزين الدائم.

---

## 🍪 استيراد الكوكيز (الطريقة الأسهل)

### الطريقة الموصى بها (EditThisCookie - ثواني):

1. ثبّت إضافة [EditThisCookie](https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg) على Chrome
2. سجّل دخولك إلى [chatgpt.com](https://chatgpt.com)
3. اضغط على أيقونة الإضافة → زر **Export** (أيقونة السهم/النسخ)
4. اذهب إلى لوحة الإدارة → **استيراد سريع** → الصق النص → **تطبيق**

### يدوياً:
- F12 → Application → Cookies → chatgpt.com → انسخ جميع القيم بصيغة `name=value;`

**المحلل الذكي يتعامل مع:**
- ✅ JSON من Chrome/EditThisCookie (كامل الخصائص)
- ✅ Cookie Header (`name=value; name2=value2`)
- ✅ قائمة كوكيز نصية متعددة الأسطر
- ✅ يتحقق تلقائياً من وجود الكوكيز الأساسية ويعرض تحذيرات

### الكوكيز المطلوبة الأساسية:
| الكوكي | الوصف |
|--------|-------|
| `__Secure-next-auth.session-token.0` & `.1` | جلسة المصادقة (الأهم) |
| `__Secure-oai-is` | حالة الجلسة |
| `__oailb` | Load balancer |
| `__cf_bm`, `__cflb`, `_cfuvid` | Cloudflare (ضرورية لتجاوز الحظر) |
| `__Host-next-auth.csrf-token` | حماية CSRF |

---

## ⏱ Cron Job (تحديث التوكن تلقائياً)

بما أن خطة Vercel Hobby تدعم cron يومي فقط، استخدم **Namecheap cPanel** أو [cron-job.org](https://cron-job.org):

- **URL**: `https://your-app.vercel.app/api/cron/refresh?secret=YOUR_CRON_SECRET`
- **الجدول**: `0 */6 * * *` (كل 6 ساعات)
- أضف `CRON_SECRET` في Vercel Environment Variables

---

## 🔑 متغيرات البيئة

| المتغير | مطلوب؟ | الوصف |
|---------|--------|-------|
| `JWT_SECRET` | ⚠️ مطلوب | مفتاح تشفير JWT (استخدم قيمة قوية) |
| `ADMIN_PASSWORD` | اختياري | كلمة مرور الإدارة الأولية (افتراضي: `admin`) |
| `ADMIN_PASSWORD_HASH` | اختياري | hash لكلمة المرور مسبقاً |
| `API_ACCESS_KEY` | اختياري | مفتاح لحماية /api/chat |
| `CHATGPT_SESSION_COOKIE` | اختياري | يمكن ضبطه بدلاً من لوحة الإدارة |
| `KV_REST_API_URL` | تلقائي | يُضاف عند ربط Upstash من Vercel |
| `KV_REST_API_TOKEN` | تلقائي | يُضاف عند ربط Upstash من Vercel |
| `UPSTASH_REDIS_REST_URL` | اختياري | Upstash خارجي |
| `UPSTASH_REDIS_REST_TOKEN` | اختياري | Upstash خارجي |
| `CRON_SECRET` | اختياري | لحماية رابط /api/cron/refresh |

---

## 🛡️ الأمان

- غيّر كلمة المرور الافتراضية (`admin`) فور أول دخول
- استخدم قيمة قوية لـ `JWT_SECRET`
- اضبط `API_ACCESS_KEY` لحماية الـ API
- كوكيز الجلسة تُعامل بسرية تامة

---

## 📁 الهيكل

```
├── app/
│   ├── page.tsx                   # واجهة المحادثة (أمثلة + chat UI)
│   ├── login/page.tsx            # تسجيل دخول الإدارة
│   ├── admin/page.tsx            # لوحة الإدارة + أداة استيراد الكوكيز
│   ├── globals.css
│   ├── layout.tsx
│   └── api/
│       ├── chat/route.ts         # نهاية API المحادثة (يدعم البث)
│       ├── models/route.ts       # قائمة النماذج
│       ├── session/route.ts      # تحديث Access Token
│       ├── admin/                # login/settings/logout/status
│       └── cron/refresh/route.ts # تحديث دوري للتوكن
├── lib/
│   ├── auth.ts                   # JWT
│   ├── settings.ts               # إدارة الإعدادات (Redis + memory)
│   ├── chatgpt.ts                # التواصل مع ChatGPT
│   ├── cookie-parser.ts          # 🆕 محلل الكوكيز الذكي
│   ├── rate-limit.ts             # تحديد الطلبات
│   └── types.ts
├── middleware.ts
├── CRON_SETUP.md                 # شرح إعداد Cron على Namecheap
└── README.md
```

---

⚠️ **إخلاء مسؤولية**: هذا المشروع لأغراض تعليمية. الاستخدام على مسؤوليتك الشخصية، وقد يخالف شروط استخدام OpenAI.
