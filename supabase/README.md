# قاعدة بيانات الأمين

المشروع المتصل: ikrrqgtcfbvaiukowvzy.supabase.co

قاعدة البيانات الحية تحتوي على الجداول:

- public.products: بيانات المنتجات والسعر والمخزون. السعر بالجنيه لكل كجم في price_per_kg، والمخزون يُخزّن بالكيلوجرام في stock_kg.
- public.orders: بيانات الطلبات الحية. يوجد عمود governorate ورمز متابعة محفوظ بصيغة hash في access_code_hash.
- public.store_admins: حسابات فريق المتجر المسموح لها بإدارة المنتجات والطلبات.

العمليات المرتبطة بالموقع: submit_store_order، get_store_order، update_pending_store_order، cancel_pending_store_order، confirm_store_order، get_customer_orders_by_phone. تؤكد قاعدة البيانات الأسعار والمجاميع، وتخصم المخزون عند تأكيد الطلب.

المخطط الحي تم تحديثه بإضافتين: bulk_orders_inventory_tracking و fix_kg_order_trigger_phone_and_customer_lookup. ملفات هذه الإضافات لم تُسترجع تلقائيًا من Supabase؛ هذه الملاحظة توثيقية وليست نسخة قابلة لإعادة إنشاء قاعدة البيانات.

لم أصدّر سجلات الطلبات أو أسماء العملاء أو أرقامهم أو عناوينهم إلى هذا المجلد أو GitHub. تبقى هذه البيانات في Supabase.
