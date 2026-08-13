# إعداد Cron Job على Namecheap cPanel

بعد رفع المشروع على Vercel بنجاح، اتبع الخطوات التالية لإعداد التحديث التلقائي للتوكن كل 6 ساعات عبر Namecheap:

## الخطوة 1: عيّن CRON_SECRET في Vercel
1. اذهب إلى مشروعك على Vercel → Settings → Environment Variables
2. أضف متغيرًا جديدًا:
   - **Key**: `CRON_SECRET`
   - **Value**: كلمة سرية قوية من اختيارك (مثل: `mySecretKey123!`)
3. اضغط Save ثم أعد نشر المشروع (Redeploy)

## الخطوة 2: إعداد Cron Job في Namecheap cPanel

1. سجّل الدخول إلى **cPanel** على استضافة Namecheap
2. ابحث عن أداة **Cron Jobs** (توجد عادة في قسم Advanced)
3. في قسم **Add New Cron Job**:
   - اختر **Common Settings** → أو أدخل الجدول التالي يدوياً:
   - **Minute**: `0`
   - **Hour**: `*/6`   (كل 6 ساعات)
   - **Day**: `*`
   - **Month**: `*`
   - **Weekday**: `*`
4. في حقل **Command**, أدخل أحد الأمرين التاليين:

### الخيار الأول: باستخدام curl (الأبسط)
```
curl -s "https://your-vercel-app.vercel.app/api/cron/refresh?secret=mySecretKey123!" > /dev/null 2>&1
```
**⚠️ استبدل:**
- `your-vercel-app.vercel.app` برابط تطبيقك على Vercel
- `mySecretKey123!` بقيمة `CRON_SECRET` التي عيّنتها في Vercel

### الخيار الثاني: باستخدام wget
```
wget -q -O - "https://your-vercel-app.vercel.app/api/cron/refresh?secret=mySecretKey123!" > /dev/null 2>&1
```

## الخطوة 3: اختبر الأمر يدوياً
1. انسخ الرابط كاملاً من الأمر أعلاه
2. افتحه في المتصفح، إذا رأيت `{"success":true,"message":"Token refreshed"}` فهو يعمل بشكل صحيح
3. أو شغّله من cPanel بالضغط على **Run Now** بجانب الـ Cron Job

## جدولة بديلة مقترحة
| الفترة | جدول Cron |
|--------|-----------|
| كل 6 ساعات | `0 */6 * * *` |
| كل 12 ساعة | `0 */12 * * *` |
| كل 24 ساعة (مرة يومياً) | `0 0 * * *` |
| كل ساعة | `0 * * * *` |

## ملاحظات
- إذا لم تعيّن `CRON_SECRET` في متغيرات البيئة على Vercel، سيعمل الرابط بدون حماية (لذا يُنصح بتعيينه)
- يمكنك أيضاً تحديث التوكن يدوياً من لوحة الإدارة (/admin) بالضغط على زر "تحديث Access Token الآن"
- إذا كانت استضافة Namecheap لا تسمح بالأوامر الخارجية، يمكنك استخدام خدمات Cron مجانية أخرى مثل:
  - **cron-job.org**
  - **UptimeRobot** (باستخدام Monitor من نوع Keyword)
