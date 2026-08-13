# 🗄️ إعداد Supabase (اختياري - للحفظ المستمر)

بدون Supabase ستُحفظ كل الإعدادات في ذاكرة السيرفر وستفقد عند إعادة التشغيل.

## الخطوات
1. سجّل في https://supabase.com وأنشئ مشروعاً مجانياً.
2. افتح **SQL Editor** في لوحة Supabase.
3. الصّق هذا الـ SQL واضغط Run:

```sql
create table if not exists public.kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- تمكين القراءة/الكتابة للخدمة (server-side فقط)
alter table public.kv enable row level security;
```

4. اذهب إلى **Project Settings → API** وانسخ:
   - **Project URL**  (شكله `https://xxx.supabase.co`)
   - **service_role key** (مفتاح الخدمة - لا تُعطِه لأحد)
5. أضفها كمتغيرات بيئة في Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

**أو** أدخلها مباشرة من لوحة الإدارة ضمن قسم "قاعدة البيانات" (ستعمل طيلة بقاء السيرفر قيد التشغيل فقط).
