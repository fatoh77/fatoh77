// Extra dialogs: order-received screen and private order tracking.
export const extraMarkup = `
<dialog id="success-dialog"><div class="dialog-form"><div class="panel-title"><h2>طلبك في انتظار القبول</h2><button type="button" class="plain" data-close-dialog>×</button></div>
<p>استلمنا طلبك، وفريق الأمين هيراجعه ويأكده قريب.</p>
<div>رقم الطلب: <b id="success-id" style="direction:ltr;display:inline-block;word-break:break-all"></b></div>
<div>الإجمالي عند الاستلام: <b id="success-total"></b></div>
<p><b>كود المتابعة الخاص بك (هيظهر مرة واحدة بس):</b></p>
<div class="code-box" id="success-code"></div>
<button type="button" class="under-link copy-code" id="success-copy">نسخ كود المتابعة</button>
<p class="err">احفظ الكود ده. هتحتاجه لفتح تفاصيل الطلب وتعديله أو إلغائه وهو لسه في انتظار القبول.</p>
<div class="btn-row"><button type="button" class="button orange" id="success-track">تتبع طلبي</button><button type="button" class="button forest" id="success-home">الرجوع للرئيسية</button></div>
</div></dialog>
<dialog id="track-dialog"><div class="dialog-form"><div class="panel-title"><h2>استعلام عن طلبي</h2><button type="button" class="plain" data-close-dialog>×</button></div>
<form id="track-form"><label>رقم الموبايل<input name="phone" type="tel" inputmode="numeric" maxlength="15" pattern="[0-9]{11,15}" required autocomplete="tel-national" placeholder="١١ رقمًا أو أكثر"/></label><button class="button orange wide" type="submit">اعرض كل طلباتي <span>←</span></button></form>
<div id="track-area"></div>
</div></dialog>`;
