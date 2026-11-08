// Extra dialogs: order-received screen and private order tracking.
export const extraMarkup = `
<dialog id="success-dialog"><div class="dialog-form"><div class="panel-title"><h2>طلبك في انتظار القبول</h2><button type="button" class="plain" data-close-dialog>×</button></div>
<p>استلمنا طلبك، وفريق الأمين هيراجعه ويأكده قريب.</p>
<div>رقم الطلب: <b id="success-id" style="direction:ltr;display:inline-block;word-break:break-all"></b></div>
<div>الإجمالي عند الاستلام: <b id="success-total"></b></div>
<p><b>كود المتابعة الخاص بك (هيظهر مرة واحدة بس):</b></p>
<div class="code-box" id="success-code"></div>
<p class="err">احفظ رقم الطلب والكود ده دلوقتي (صوّرهم أو اكتبهم). هتحتاجهم مع رقم موبايلك عشان تتابع أو تعدّل الطلب، ومش هنقدر نعرضهم تاني.</p>
<div class="btn-row"><button type="button" class="button orange" id="success-track">تتبع طلبي</button><button type="button" class="button forest" id="success-home">الرجوع للرئيسية</button></div>
</div></dialog>
<dialog id="track-dialog"><div class="dialog-form"><div class="panel-title"><h2>استعلام عن طلبي</h2><button type="button" class="plain" data-close-dialog>×</button></div>
<form id="track-form"><label>رقم الطلب<input name="order_id" required dir="ltr" autocomplete="off"/></label><label>رقم الموبايل<input name="phone" type="tel" inputmode="numeric" maxlength="11" required placeholder="01xxxxxxxxx"/></label><label>كود المتابعة<input name="code" required dir="ltr" maxlength="12" autocomplete="off" style="text-transform:uppercase"/></label><button class="button orange wide" type="submit">اعرض الطلب <span>←</span></button></form>
<div id="track-area"></div>
</div></dialog>`;
