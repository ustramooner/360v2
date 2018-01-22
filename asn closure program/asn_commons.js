var ASN_SUBLISTID = 'recmachcustrecord_ts_created_fm_asn';

var CUST_BILLING_TYPE_AGENCY = 1;
// "Agency"
var CUST_BILLING_TYPE_PRINCIPAL = 2;
// "Principal"
var CUST_BILLING_TYPE_TRADING = 3;
// "Trading"

// ITEM
var ITEM_AGENCY = 46970;
var ITEM_3RD_PARTY_CHARGE = 38446;
var ITEM_GROSSMARGIN = 46969;
var ITEM_OFFSET = 46971;
var ITEM_SUBTOTAL = -2;

// Default to: TS Holdings > ThreeSixty (HK) = 6
var SUB_THREESIXTY_HK = 6;

// Default to:
var LOC_THREESIXTY = 4497;

var SAVED_SEARCH_ASN = 'customsearch_asn_search'; // TS SCRIPTUSE-ASN Search-DoNotEditDelete
var SAVED_SEARCH_CHECK_ADDL_CHARGES = 'customsearch_check_adl_charges';
var SAVED_SEARCH_PO_LINES = 'customsearch_asn_po_lines';

var FORM_TS_PRODUCT_INVOICE = 160;
var FORM_TS_ITEM_FULFILLMENT = 161;
var FORM_TS_SALES_ORDER = 164;

var INVOICE_TYPE_A_TRADE_AUTO_INVOICE = 1;

var PAYMENT_METHOD_DOCUMENT_PENDING = 1;

var ASN_STAT_ERROR = 6;

// 104004 Inventory - Agency Customer - TSG ACCOUNT;
var DEFAULT_ADJUSTMENT_ACCOUNT = 1763;

var SCRIPT_TEST_NOTES = ''; // updated by HY 6-Sept-2016

var TERMS_SUPPLIER = 123;

var arrContainerMap = [];

/**
 * 
 * @param arrPO
 * @returns {Array}
 */
function getPOIds(arrPO) {

	dLog('getPOIds', 'PO Ids = ' + arrPO);

	var arrPOMap = [];
	var rs = nlapiSearchRecord('purchaseorder', null, new nlobjSearchFilter('formulanumeric', null, 'equalto', '1').setFormula("CASE WHEN  {tranid} in ('" + arrPO.join("','")
			+ "') THEN 1 ELSE 0 END "), new nlobjSearchColumn('tranid'));

	for (var i = 0; rs != null && i < rs.length; i++) {
		arrPOMap[rs[i].getValue('tranid')] = rs[i].getId();
	}

	return arrPOMap;
}

function initSORec(objRS) {
	var rec = nlapiCreateRecord('salesorder', {
		recordmode : 'dynamic',
		customform : FORM_TS_SALES_ORDER,
		entity : objRS[0].getValue('custrecord_asn_bill_to_customer'),
	});
	rec.setFieldValue('custbody_ts_related_supplier', objRS[0].getValue('custrecord_ts_asn_supplier'));
	rec.setFieldValue('custbody_ts_customer_invoice_remarks', objRS[0].getValue('custrecord_ts_asn_cust_inv_remarks')); // issue 308	
	rec.setFieldValue('custbody_ts_invoice_commercial_inv_num', objRS[0].getValue('custrecord_ts_asn_cpl_comm_inv_no'));
	rec.setFieldValue('location', LOC_THREESIXTY);
	arrContainerMap = getContainerDetails(objRS[0].getId());

	return rec;
}

/**
 * 
 * @param arrPO
 */
function receiptPO(arrPO, asnId, isZeroAmt) {

	dLog('receiptPO', '>>>>>>>>>>>>>>>');

	var arrIR = [];
	var isOk = true;
	for (ip in arrPO) {

		try {
			// Perform PO Receipt against PO
			var rec = nlapiTransformRecord('purchaseorder', arrPO[ip], 'itemreceipt', {
				recordmode : 'dynamic'
			});

			rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);

			// Set Rate (unit price of PO receipt record) to zero and use lot
			// number
			// as customer po number.
			var lineCtr = rec.getLineItemCount('item');
			var serialNo = rec.getFieldValue('custbody_ts_rspo_customer_po_no');

			dLog('receiptPO', 'serialNo = ' + serialNo);
			var arrItemId = [];

			for (var ix = 1; ix <= lineCtr; ix++) {

				var item = rec.getLineItemValue('item', 'item', ix);
				arrItemId.push(item);
			}

			var arrItemLotMap = checkItemLot(arrItemId);

			for (var i = 1; i <= lineCtr; i++) {

				rec.selectLineItem('item', i);
				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				if (isZeroAmt)
					rec.setCurrentLineItemValue('item', 'rate', 0);

				var itemId = rec.getCurrentLineItemValue('item', 'item');
				var quantity = rec.getCurrentLineItemValue('item', 'quantity');

				if (arrItemLotMap[itemId] == 'T') {

					dLog('receiptPO', 'setting sublist @ line ' + i + ' | Serial No. : ' + serialNo + ' | Qty : ' + quantity);

					var serialLotNum = serialNo + '(' + quantity + ')';
					dLog('receiptPO', 'serialLotNum = ' + serialLotNum);

					rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
				}

				rec.commitLineItem('item');
			}

			rec.setFieldValue('memo', SCRIPT_TEST_NOTES);

			var id = nlapiSubmitRecord(rec, true, true);
			dAudit('receiptPO', 'Created Item Receipt | id = ' + id);

			arrIR.push(id);
		}
		catch (e) {

			var stErrMsg = '';
			if (e.getDetails !== undefined) {
				stErrMsg = 'Receipt PO Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
			} else {
				stErrMsg = 'Receipt PO Error: ' + e.toString();
			}

			dLog('Receipt PO Error', stErrMsg);

			nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

			isOk = false;
		}
	}

	return arrIR;
}

/**
 * 
 * @param arrPO
 */
function closePO(arrPO) {

	dLog('closePO', '>>>>>>>>>>>>>>>');
	var isOk = true;
	for (ip in arrPO) {

		try {

			var rec = nlapiLoadRecord('purchaseorder', arrPO[ip]);
			var lineCtr = rec.getLineItemCount('item');

			for (var i = 1; i <= lineCtr; i++) {

				// Close the PO line record.
				rec.setLineItemValue('item', 'isclosed', i, 'T');
			}

			rec.setFieldValue('memo', 'CLOSED: ' + SCRIPT_TEST_NOTES);

			nlapiSubmitRecord(rec, true, true);
		}
		catch (e) {

			var stErrMsg = '';
			if (e.getDetails !== undefined) {
				stErrMsg = 'Close PO Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
			} else {
				stErrMsg = 'Close PO Error: ' + e.toString();
			}

			dLog('Close PO Error', stErrMsg);
			isOk = false;
		}
	}

	return isOk;
}

/**
 * 
 * @param cust
 * @param ir
 */
function createAdjustment(cust, arrIR, asnId) {

	dLog('createAdjustment', '>>>>>>>>>>>>>>>');
	var isOk = true;
	try {

		var recAdj = nlapiCreateRecord('inventoryadjustment');
		recAdj.setFieldValue('subsidiary', SUB_THREESIXTY_HK);
		recAdj.setFieldValue('account', DEFAULT_ADJUSTMENT_ACCOUNT);
		recAdj.setFieldValue('trandate', nlapiDateToString(new Date()));
		recAdj.setFieldValue('custbody_ts_rspo_related_asn', asnId);

		for (irx in arrIR) {

			dLog('createAdjustment', 'Loading Item Receipt | id = ' + arrIR[irx]);
			var recIR = nlapiLoadRecord('itemreceipt', arrIR[irx]);
			var lineCtr = recIR.getLineItemCount('item');
			var arrItemId = [];

			for (var ix = 1; ix <= lineCtr; ix++) {

				var item = recIR.getLineItemValue('item', 'item', ix);

				if (recIR.getLineItemValue('item', 'itemtype', ix) == 'OthCharge')
					continue;

				arrItemId.push(item);
			}
			//Inventory Adjustment for Other Charge - Case No - SC1779
			dLog('createAdjustment', 'arrItemId length = ' + arrItemId.length);
			if(arrItemId.length == 0)
				{
				//return true;
                    continue;
				}
			var arrItemLotMap = (arrItemId.length > 0) ? checkItemLot(arrItemId) : [];

			for (var i = 1; i <= lineCtr; i++) {

				if (recIR.getLineItemValue('item', 'itemreceive', i) == 'F')
					continue;

				if (recIR.getLineItemValue('item', 'itemtype', i) == 'OthCharge')
					continue;

				var item = recIR.getLineItemValue('item', 'item', i);
				var itemLoc = recIR.getLineItemValue('item', 'location', i);
				var itemQty = recIR.getLineItemValue('item', 'quantity', i);
				var itemSerialNos = recIR.getLineItemValue('item', 'serialnumbers', i);

				dLog('createAdjustment', 'item = ' + item);
				dLog('createAdjustment', 'itemLoc = ' + itemLoc);
				dLog('createAdjustment', 'itemQty = ' + itemQty);
				dLog('createAdjustment', 'itemSerialNos = ' + itemSerialNos);

				recAdj.selectNewLineItem('inventory');
				recAdj.setCurrentLineItemValue('inventory', 'item', item);
				recAdj.setCurrentLineItemValue('inventory', 'location', itemLoc);
				recAdj.setCurrentLineItemValue('inventory', 'adjustqtyby', parseFloat(itemQty) * -1);

				if (arrItemLotMap[item] == 'T')
					recAdj.setCurrentLineItemValue('inventory', 'serialnumbers', itemSerialNos);

				recAdj.commitLineItem('inventory');
			}
		}

		if (!isEmpty(SCRIPT_TEST_NOTES))
			recAdj.setFieldValue('memo', SCRIPT_TEST_NOTES);
		var linecount = recAdj.getLineItemCount('item');
		if(linecount < 0 ){
          		dLog('createAdjustment', 'recAdj line count before submit = ' + linecount);
          		return true;
        }
		var id = nlapiSubmitRecord(recAdj, true, true);

		dAudit('createAdjustment', 'Created Inv. Adj | id = ' + id);
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Adjustment Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Adjustment Error: ' + e.toString();
		}

		dLog('Adjustment Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		isOk = false;
	}

	return isOk;
}

function transformPOToBill(arrPO, recASN, arrMap, rsObj) {

	dLog('transformPOToBill', '>>>>>>>>>>>>>>>');

	var blanketPO = rsObj[0].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
	var asnSupplier = recASN.getFieldValue('custrecord_ts_asn_supplier');
	var asnOrigDoRcvdDate = recASN.getFieldValue('custrecord_ts_asn_org_doc_rec_dd');
	var objVendor = !isEmpty(asnSupplier) ? nlapiLookupField('vendor', asnSupplier, [ 'terms', 'custentity_ts_vendor_pyt_method' ]) : '';
	var blanketPOTerms = !isEmpty(blanketPO) ? nlapiLookupField('customrecord_ts_blanket_po', blanketPO, 'custrecord_ts_bpo_pyt_terms') : '';
	var supplierTermDays = !isEmpty(objVendor.terms) ? getTermDays(objVendor.terms) : 0;
	var blanketPOTermDays = !isEmpty(blanketPOTerms) ? getTermDays(blanketPOTerms) : 0;
	var dueDate = asnOrigDoRcvdDate;
	var today = nlapiDateToString(getTSHKCurrentDateTime());

	dLog('transformPOToBill', 'asnSupplier = ' + asnSupplier);
	dLog('transformPOToBill', 'blanketPO = ' + blanketPO);
	dLog('transformPOToBill', 'asnOrigDoRcvdDate = ' + asnOrigDoRcvdDate);
	dLog('transformPOToBill', 'Blanket PO Terms = ' + blanketPOTerms);
	dLog('transformPOToBill', 'Blanket PO Terms days = ' + blanketPOTermDays);
	dLog('transformPOToBill', 'Supplier Terms = ' + objVendor.terms);
	dLog('transformPOToBill', 'supplierTermDays = ' + supplierTermDays);

	try {

		// Transform PO into Vendor Bill
		var recBill = nlapiCreateRecord('vendorbill', {
			recordmode : 'dynamic',
			entity : asnSupplier
		});

		recBill.setFieldValue('location', LOC_THREESIXTY);
		recBill.setFieldValue('tranid', recASN.getFieldValue('custrecord_asn_supplier_inv_num'));

		if (!isEmpty(asnOrigDoRcvdDate)) {

			if (periodClosed(asnOrigDoRcvdDate) == 'T') {
				recBill.setFieldValue('trandate', today);
			} else {
			//	recBill.setFieldValue('trandate', asnOrigDoRcvdDate);
				recBill.setFieldValue('trandate', today); // added by hy 29-8-2016
			}

			recBill.setFieldValue('custbody_ts_ap_org_doc_rcpt_dd', asnOrigDoRcvdDate);
			recBill.setFieldValue('custbody_ts_ap_pyt_method', objVendor.custentity_ts_vendor_pyt_method);

			// if (!isEmpty(supplierTermDays))
			// dueDate =
			// nlapiDateToString(nlapiAddDays(nlapiStringToDate(asnOrigDoRcvdDate),
			// supplierTermDays));

			if (!isEmpty(blanketPOTermDays))
				dueDate = nlapiDateToString(nlapiAddDays(nlapiStringToDate(asnOrigDoRcvdDate), blanketPOTermDays));

		} else {

			var onBoardDate = recASN.getFieldValue('custrecord_asn_actual_onboard_dd');

			if (periodClosed(onBoardDate) == 'T') {
				recBill.setFieldValue('trandate', today);
			} else {
				// recBill.setFieldValue('trandate', onBoardDate);
				recBill.setFieldValue('trandate', today); // added by hy 29-8-2016
			}

			// Place bill on hold
			// recBill.setFieldValue('custbody_ts_ap_pyt_method',
			// PAYMENT_METHOD_DOCUMENT_PENDING);
			// recBill.setFieldValue('paymenthold', 'T');

			// [1:38:29 PM] Dane Butera: Herman wants the generated bill:
			// SL2016-0618 to leave a check mark in the box: Document Pending.
			// It can be found on the right side of the screen under the payment
			// hold column. Does that make sense.
			// [1:39:50 PM] Dane Butera: custbody_ts_ap_document_pending -
			// Herman wants this item to "check" the box when
			// custrecord_ts_asn_org_doc_rec_dd is empty.
			recBill.setFieldValue('custbody_ts_ap_document_pending', 'T');
			recBill.setFieldValue('custbody_ts_ap_pyt_method', '1');
			recBill.setFieldValue('paymenthold', 'T');
			recBill.setFieldValue('custbody_ts_apply_hold', 'T');

			// if (!isEmpty(onBoardDate) && !isEmpty(supplierTermDays))
			// dueDate =
			// nlapiDateToString(nlapiAddDays(nlapiStringToDate(onBoardDate),
			// supplierTermDays));
			if (!isEmpty(onBoardDate) && !isEmpty(blanketPOTermDays))
				dueDate = nlapiDateToString(nlapiAddDays(nlapiStringToDate(onBoardDate), blanketPOTermDays));
		}


		// Set Payment Terms
		if (!isEmpty(blanketPOTerms))
			recBill.setFieldValue('terms', blanketPOTerms);
		
		dLog('transformPOToBill', 'dueDate = ' + dueDate);
		// Due Date 'duedate' = Original Doc Received Date + Payment Terms.
		recBill.setFieldValue('duedate', dueDate);

		// Posting Period 'postingperiod' = Current Period.
		recBill.setFieldText('postingperiod', getPostingDate());
		recBill.setFieldValue('memo', SCRIPT_TEST_NOTES);

		recBill.setFieldValue('custbody_ts_rspo_related_asn', recASN.getId());

		var rsPO = getPOLines(arrPO);

		dLog('transformPOToBill', 'PO Lines = ' + rsPO);

		if (rsPO != null) {

			dLog('transformPOToBill', 'ASN results = ' + rsObj);

			var arrDescMap = [];
			for (var adx = 0; adx < rsObj.length; adx++) {

				var releaseShipmentPO = rsObj[adx].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var item = rsObj[adx].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

				arrDescMap[releaseShipmentPO + item] = rsObj[adx].getValue('custrecord_ts_asn_item_desc', 'CUSTRECORD_TS_CREATED_FM_ASN');
			}

			for (var i = 0; i < rsPO.length; i++) {

				var itemId = rsPO[i].getValue('item', null, 'group');
				var poId = rsPO[i].getValue('internalid', null, 'group');
				var serialNumbers = arrMap[poId].custpono;
				var qty = rsPO[i].getValue('quantity', null, 'max');
				var itemname = nlapiLookupField('item', itemId, 'itemid');
				dLog('transformPOToBill', 'serialNumbers = ' + serialNumbers);
				dLog('transformPOToBill', 'qty = ' + qty);

				recBill.selectNewLineItem('item');
				recBill.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', arrMap[poId].asnline);
				recBill.setCurrentLineItemValue('item', 'item', itemId);
				recBill.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				recBill.setCurrentLineItemValue('item', 'quantity', rsPO[i].getValue('quantity', null, 'max'));
				//Added by Karthika for SC1707
				recBill.setCurrentLineItemValue('item', 'custcolmemo', itemname);
				// ref issue log 302.2
		         recBill.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', arrMap[poId].custpono);
		         // end ref issue log 302.2
				
				if (!isEmpty(arrDescMap[poId + itemId]))
					recBill.setCurrentLineItemValue('item', 'description', arrDescMap[poId + itemId]);

				recBill.setCurrentLineItemValue('item', 'rate', rsPO[i].getValue('rate', null, 'max'));

				if (!isEmpty(serialNumbers))
					recBill.setCurrentLineItemValue('item', 'serialnumbers', serialNumbers + '(' + qty + ')');

				recBill.commitLineItem('item');
			}

		} else {
			dLog('transformPOToBill', 'NO PO lines found.');
		}

		var id = nlapiSubmitRecord(recBill, true, true);
		dAudit('transformPOToBill', 'Created Bill | id = ' + id);

		return id;
	}
	catch (e) {

		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Transform PO>Bill Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Transform PO>Bill Error: ' + e.toString();
		}

		dLog('Transform PO>Bill Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', recASN.getId(), [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);
	}
}

function transformToFulfillment(soId, asnId) {

	try {
		// transform SO to Fulfillment.
		var recIF = nlapiTransformRecord('salesorder', soId, 'itemfulfillment', {
			recordmode : 'dynamic',
			customform : FORM_TS_ITEM_FULFILLMENT
		});
		var today = nlapiDateToString(getTSHKCurrentDateTime());
		recIF.setFieldValue('trandate', today);
		recIF.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		var lineCtr = recIF.getLineItemCount('item');

		for (var i = 1; i <= lineCtr; i++) {
			recIF.setLineItemValue('item', 'location', i, LOC_THREESIXTY);
		}

		var ifId = nlapiSubmitRecord(recIF, true, true);
		dAudit('transformToFulfillment', 'Fulfillment created | id = ' + ifId);

		return ifId;
	}
	catch (e) {

		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Transform To Fulfillment Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Transform To Fulfillmentl Error: ' + e.toString();
		}

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return '';
	}
}

function getAddlCharges(arrIds) {

	var arrItemMap = [];
	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];
	var rs = nlapiSearchRecord('customrecord_ts_blanket_po_line', SAVED_SEARCH_CHECK_ADDL_CHARGES, filters);

	for (var i = 0; rs != null && i < rs.length; i++) {

		arrItemMap[rs[i].getId()] = {
			charge_item : rs[i].getValue('custentity_ts_supplier_add_charge_item', 'CUSTRECORD_TS_BPOL_ADD_CHARGE_PAY_TO'),
			charge_item_unit : rs[i].getValue('custentity_ts_vendor_addcharge_itemunit', 'CUSTRECORD_TS_BPOL_ADD_CHARGE_PAY_TO'),
			adlchrgepercent : rs[i].getValue('custrecord_ts_bpol_add_charge_percent'),
			adlchrgeunit : rs[i].getValue('custrecord_ts_add_charge_per_unit'),
			grossmargin : rs[i].getValue('custrecord_ts_bpol_gross_margin_rate'),
		    oh_number: '' // - 3rd feb 2017 ref Dennis email 810 import format
		};
	}

	return arrItemMap;
}

function getBlanketPOLineInfo(arrIds) {

	var arrItemMap = [];
	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];
	var columns = [];
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_gross_margin_rate'));
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_add_charge_pay_to'));
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_add_charge_percent'));
	columns.push(new nlobjSearchColumn('custrecord_ts_add_charge_per_unit'));
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_hts_code'));
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_selling_price'));
	columns.push(new nlobjSearchColumn('custrecord_ts_bpol_item_descpt'));

	var rs = nlapiSearchRecord('customrecord_ts_blanket_po_line', null, filters, columns);

	for (var i = 0; rs != null && i < rs.length; i++) {

		arrItemMap[rs[i].getId()] = {
			grossmargin : rs[i].getValue('custrecord_ts_bpol_gross_margin_rate'),
			adlchrgepayto : rs[i].getValue('custrecord_ts_bpol_add_charge_pay_to'),
			adlchrgepercent : rs[i].getValue('custrecord_ts_bpol_add_charge_percent'),
			adlchrgeunit : rs[i].getValue('custrecord_ts_add_charge_per_unit'),
			htscode : rs[i].getValue('custrecord_ts_bpol_hts_code'),
			linerate : rs[i].getValue('custrecord_ts_bpol_selling_price'),
			itemdesc : rs[i].getValue('custrecord_ts_bpol_item_descpt')
		};
	}

	return arrItemMap;
}

function getItemType(arrId) {

	var arrRetMap = [];
	var rs = nlapiSearchRecord('item', null, new nlobjSearchFilter('internalid', null, 'anyOf', arrId), new nlobjSearchColumn('type'));
	for (var i = 0; rs != null && i < rs.length; i++) {
		arrRetMap[rs[i].getId()] = rs[i].getValue('type');
	}

	return arrRetMap;
}

function getTermDays(id) {
	var rs = nlapiSearchRecord('term', null, new nlobjSearchFilter('internalid', null, 'anyOf', id), new nlobjSearchColumn('daysuntilnetdue'));

	return (rs) ? rs[0].getValue('daysuntilnetdue') : null;
}

function checkItemLot(arr) {
	var arrMapRet = [];
	var filters = [];
	filters.push(new nlobjSearchFilter('internalid', null, 'anyOf', arr));

	var rs = nlapiSearchRecord('item', null, filters, new nlobjSearchColumn('islotitem'));

	for (var i = 0; rs != null && i < rs.length; i++) {
		arrMapRet[rs[i].getId()] = rs[i].getValue('islotitem');
	}

	return arrMapRet;
}

function getPOLines(arrIds) {

	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];
	return nlapiSearchRecord('purchaseorder', SAVED_SEARCH_PO_LINES, filters);

}

function getBlanketPOInfo(arrIds) {

	var arrMapRet = [];
	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];
	var rs = nlapiSearchRecord('customrecord_ts_blanket_po', null, filters, [ new nlobjSearchColumn('custrecord_ts_bpo_supplier'), new nlobjSearchColumn('custrecord_ts_bpo_fty') ]);

	for (var i = 0; rs != null && i < rs.length; i++) {
		arrMapRet[rs[i].getId()] = {
			supplier : rs[i].getValue('custrecord_ts_bpo_supplier'),
			factory : rs[i].getValue('custrecord_ts_bpo_fty')
		};
	}

	return arrMapRet;
}

function getPOIncoterm(arr) {

	var arrMapRet = [];
	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arr) ];
	var rs = nlapiSearchRecord('purchaseorder', null, filters, new nlobjSearchColumn('custbody_ts_rspo_title_transfer'));

	for (var i = 0; rs != null && i < rs.length; i++) {
		arrMapRet[rs[i].getId()] = rs[i].getValue('custbody_ts_rspo_title_transfer');
	}

	return arrMapRet;
}

function raiseError(asnId) {

	try {

		var SS_EMAIL_SENDER = -5;
		var SS_EMAIL_TO = 'devgorio@gmail.com';
		var EMAIL_SUBJECT = 'Insufficient Quantity of local components';

		dLog('raiseError', 'Raise Error - Sending Email. >>>Start<<<');

		nlapiSendEmail(SS_EMAIL_SENDER, SS_EMAIL_TO, EMAIL_SUBJECT, 'Insufficient local components are available for ASN Id = ' + asnId);

		dLog('raiseError', 'Raise Error - Sending Email. >>>End<<<');
	}
	catch (e) {

		var stErrMsg = '';
		if (e.getDetails != undefined) {
			stErrMsg = 'Script Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Script Error: ' + e.toString();
		}

		dLog('Script Error', stErrMsg);
	}
}

function hasEnoughComponents(arrASNLineData) {

	// if arrASNLineData length is zero, all items may be only charge items so return true
	if (arrASNLineData.length == 0)
		return true;
	
	var arrASNLineQtyMap = [];
	var arrCompoIds = [];
	var arrCompoFinalItem = [];
	for (ix in arrASNLineData) {

		var compoId = arrASNLineData[ix].compoitem;
		arrASNLineQtyMap[compoId] = arrASNLineData[ix].asnlineqty;

		arrCompoIds.push(compoId);

		if (arrCompoFinalItem[compoId] == null)
			arrCompoFinalItem[compoId] = [];

		arrCompoFinalItem[compoId].push(arrASNLineData[ix].finalitem);
	}

	dLog('hasEnoughComponents', 'arrCompoIds = ' + arrCompoIds);

	var arrSubCompInfoMap = getComponentsInfo(arrCompoIds);
	var arrSubCompItem = [];
	var arrSubComLineQty = [];
	var arrFinalBomQtyMap = [];

	for (icx in arrSubCompInfoMap) {

		var compId = icx;
		var objTemp = arrSubCompInfoMap[icx];

		// find final bom qty first
		for (ix in objTemp) {

			var subCompId = objTemp[ix].subcompid;

			if (arrCompoFinalItem[icx] == subCompId) {
				arrFinalBomQtyMap[icx] = objTemp[ix].bomqty;
				break;
			}
		}

		for (k in objTemp) {
			var subCompId = objTemp[k].subcompid;

			// only add local items, final is skipped
			if (isEmpty(subCompId))
				continue;

			var arrFinalItems = arrCompoFinalItem[icx];
			var isFinal = false;

			for (kdx in arrFinalItems) {

				if (arrFinalItems[kdx] == subCompId) {
					isFinal = true;
					break;
				}
			}

			if (!isFinal)
				arrSubCompItem.push(subCompId);

			arrSubComLineQty[subCompId] = {
				asnqty : arrASNLineQtyMap[icx],
				bomqty : objTemp[k].bomqty,
				finalbomqty : arrFinalBomQtyMap[icx]
			};
		}
	}

	dLog('hasEnoughComponents', 'arrSubCompItem = ' + arrSubCompItem);

	if (arrSubCompItem.length < 1)
		return true;

	var arrSubCompAvailableMap = getQtyAvailable(arrSubCompItem);

	dLog('hasEnoughComponents', 'arrSubCompAvailableMap length = ' + arrSubCompAvailableMap.length);

	if (arrSubCompAvailableMap.length < 1)
		return false;

	for (x in arrSubCompAvailableMap) {

		var itemQtyAvailable = getFloatVal(arrSubCompAvailableMap[x]);
		var itemId = x;
		var asnQty = arrSubComLineQty[x].asnqty;
		var bomQty = arrSubComLineQty[x].bomqty;
		var finalBomQty = getFloatVal(arrSubComLineQty[x].finalbomqty);
		var reqQty = getFloatVal(asnQty) * getFloatVal(bomQty) / (finalBomQty == 0) ? 1 : finalBomQty;
		// TODO check if why 0;

		dLog('hasEnoughComponents', 'Item id = ' + itemId + ' | Qty Available = ' + itemQtyAvailable + ' | ASN line Qty =' + asnQty + ' | BOM Qty = ' + bomQty + ' | Req Qty = ' + reqQty
				+ ' |  Final item bom qty = ' + finalBomQty);

		if (itemQtyAvailable < reqQty) {

			return false;
		}
	}

	return true;
}

function getComponentsInfo(arrIds) {

	var arrRetMap = [];
	
	// if arrIds is null, all items may be only charge items so return empty array
	if (isEmpty(arrIds))
		return arrRetMap;	
	
	var filters = [ new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];

	var rs = nlapiSearchRecord('item', 'customsearch1238', filters);

	for (var i = 0; rs != null && i < rs.length; i++) {

		if (arrRetMap[rs[i].getId()] == null)
			arrRetMap[rs[i].getId()] = [];

		arrRetMap[rs[i].getId()].push({
			subcompid : rs[i].getValue('custrecord_ts_component_item', 'CUSTRECORD_TS_RELATED_COMPOSITE_ITEM'),
			bomqty : rs[i].getValue('custrecord_ts_bom_qty', 'CUSTRECORD_TS_RELATED_COMPOSITE_ITEM')
		});
	}

	return arrRetMap;
}

function getItemIdMap(arrItemNum) {

	var arrItemSKUMap = [];
	var arrFilterExp = [];
	for (x in arrItemNum) {

		if (x != 0)
			arrFilterExp.push('or');

		arrFilterExp.push([ 'itemid', 'is', arrItemNum[x] ]);
	}

	dLog('getItemIdMap', 'arrFilterExp = ' + arrFilterExp);
	var search = nlapiCreateSearch('item', arrFilterExp, new nlobjSearchColumn('itemid'));

	var rs = search.runSearch();

	rs.forEachResult(function(sr) {

		var sku = sr.getValue('itemid');

		arrItemSKUMap[sku] = sr.getId();
	});

	return arrItemSKUMap;
}

function getQtyAvailable(arrIds) {

	var arrRetMap = [];
	var filters = [ new nlobjSearchFilter('inventorylocation', null, 'anyOf', LOC_THREESIXTY), new nlobjSearchFilter('internalid', null, 'anyOf', arrIds) ];
	var rs = nlapiSearchRecord('item', null, filters, new nlobjSearchColumn('locationquantityonhand'));

	for (var i = 0; rs != null && i < rs.length; i++) {
		arrRetMap[rs[i].getId()] = rs[i].getValue('locationquantityonhand');
	}

	return arrRetMap;
}

function getOtherCharges(bpo, custPONo) {

	var filters = [ new nlobjSearchFilter('custrecord_ts_bpo_customer_po_no', 'custrecord_ts_asn_bpo_line_no', 'is', custPONo),
			new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custrecord_ts_asn_bpo_line_no', 'is', bpo) ];
	return nlapiSearchRecord('customrecord_ts_asn_item_details', 'customsearch_asn_other_charge_item', filters);
}

function setTransLines(rec, objLineData) {

	for ( var key in objLineData) {

		if (objLineData.hasOwnProperty(key)) {

			var val = objLineData[key];

			dLog('setTransLines', 'Fld id = ' + key);
			dLog('setTransLines', 'Fld value = ' + val);

			rec.setCurrentLineItemValue('item', key, val);
		}
	}
}

function getPostingDate() {
	var arrMonth = [];
	arrMonth[0] = 'Jan';
	arrMonth[1] = 'Feb';
	arrMonth[2] = 'Mar';
	arrMonth[3] = 'Apr';
	arrMonth[4] = 'May';
	arrMonth[5] = 'Jun';
	arrMonth[6] = 'Jul';
	arrMonth[7] = 'Aug';
	arrMonth[8] = 'Sep';
	arrMonth[9] = 'Oct';
	arrMonth[10] = 'Nov';
	arrMonth[11] = 'Dec';

	var today = getTSHKCurrentDateTime();

	return arrMonth[today.getMonth()] + ' ' + today.getFullYear();
}

function getASNItemType(rsASN) {

	var arrItems = [];
	var arrItemTypeMap = [];
	for (var ix = 0; ix < rsASN.length; ix++) {

		var item = rsASN[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

		if (!isEmpty(item))
			arrItems.push(item);
	}

	if (arrItems.length > 0) {
		var rs = nlapiSearchRecord('item', null, new nlobjSearchFilter('internalid', null, 'anyOf', arrItems), new nlobjSearchColumn('type'));

		for (var iy = 0; rs != null && iy < rs.length; iy++) {
			arrItemTypeMap[rs[iy].getId()] = rs[iy].getValue('type');
		}
	}

	return arrItemTypeMap;
}

function setTransCols(rec, obj) {

	// dLog('setTransCols', 'Blanket Info = ' + JSON.stringify(obj));

	if (!isEmpty(obj.adlchrgepayto))
		rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', obj.adlchrgepayto);
	if (!isEmpty(obj.adlchrgepercent))
		rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', obj.adlchrgepercent);
	if (!isEmpty(obj.adlchrgeunit))
		rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', obj.adlchrgeunit);
	if (!isEmpty(obj.grossmargin))
		rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', obj.grossmargin);
	if (!isEmpty(obj.htscode))
		rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', obj.htscode);
}

function setGrossMargin(rec, grossMargin, subTotal, oh_number) {

	rec.selectNewLineItem('item');
	rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
	rec.setCurrentLineItemValue('item', 'rate', grossMargin);
	rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', grossMargin);
    rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); //3rd feb 2017 ref Dennis email 810 import format
	subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));
	rec.commitLineItem('item');

	dLog('setGrossMargin', 'Set Gross Margin line..');

	return subTotal;
}
// To set memo values
function setGrossMargin2(rec, grossMargin, subTotal, oh_number,itemname,item_desc,itemclassid,asnLine,blanketPOLine,blanketPO) {
	//dLog('setGrossMargin2', 'Entered..');
	//var item_desc = objBPOLineInfo.itemdesc;
	//dLog('setGrossMargin2', 'grossMargin..' + grossMargin);
	//dLog('setGrossMargin2', 'item_desc..' + item_desc);
    dLog('setGrossMargin2', 'asnLine..' + asnLine);
	dLog('setGrossMargin2', 'blanketPOLine..' + blanketPOLine);
	dLog('setGrossMargin2', 'blanketPO..' + blanketPO);
	rec.selectNewLineItem('item');
  	rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', '' );
	rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', '' ); // RELEASE SHIPMENT PO
	rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine ); //BLANKET PO LINE
	rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO );  // BLANKET PO #
	rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', '' );   //  CUSTOMER PO NO.
	rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
	rec.setCurrentLineItemValue('item', 'rate', grossMargin);
	rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', grossMargin);
    rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); //3rd feb 2017 ref Dennis email 810 import format
    rec.setCurrentLineItemValue('item', 'description', item_desc);
    rec.setCurrentLineItemValue('item', 'class', itemclassid);
    rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
    subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));
	rec.commitLineItem('item');

	dLog('setGrossMargin2', 'Set Gross Margin line..');

	return subTotal;
}

function setSubTotal(rec, subTotal) {

	rec.selectNewLineItem('item');
	rec.setCurrentLineItemValue('item', 'item', ITEM_SUBTOTAL);
	rec.commitLineItem('item');

	dLog('setSubTotal', 'Set Subtotal line..');
}

function setAddlCharge(rec, objBPOMap, asnLineQty, objBPOLineInfo, subTotal, compoItem) {

	// additional charge
	var addlChargeRate = objBPOMap.adlchrgepercent;
	var addlChargeAmt = objBPOMap.adlchrgeunit;
	var chargeItem = (isEmpty(objBPOMap.charge_item)) ? objBPOMap.charge_item_unit : objBPOMap.charge_item;
	var oh_number = objBPOMap.oh_number; //3rd feb 2017 ref Dennis email 810 import format
	//Added by Karthika for issue SC-1562
	var item_desc = objBPOLineInfo.itemdesc ; 
    var item_name = objBPOMap.itemname ; 
    var item_classid = objBPOMap.itemclassid;
  	var asnLine = objBPOMap.asnLine;
    var blanketPOLine = objBPOMap.blanketPOLine;
    var blanketPO  = objBPOMap.blanketPO;
	//dLog('setAddlCharge', 'addlChargeRate = ' + addlChargeRate);
	//dLog('setAddlCharge', 'addlChargeAmt = ' + addlChargeAmt);
	//dLog('setAddlCharge', 'chargeItem = ' + chargeItem);
	dLog('setAddlCharge', 'asnLine KKKK = ' + asnLine); 
	dLog('setAddlCharge', 'blanketPOLine KKKK = ' + blanketPOLine); 
	dLog('setAddlCharge', 'blanketPO KKKK = ' + blanketPO); 
	if (!isEmpty(chargeItem)) {

		rec.selectNewLineItem('item');
      	rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', '');
		//Commented for blank
		rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', '' ); // RELEASE SHIPMENT PO
		rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine ); //BLANKET PO LINE
		rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO  );  // BLANKET PO #
		rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', '' );   //  CUSTOMER PO NO.
		//Ends here
		rec.setCurrentLineItemValue('item', 'item', chargeItem);
		rec.setCurrentLineItemValue('item', 'quantity', asnLineQty);
		rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
	    rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); //3rd feb 2017 ref Dennis email 810 import format
     	rec.setCurrentLineItemValue('item', 'description', item_desc);
		rec.setCurrentLineItemValue('item', 'custcolmemo', item_name);
		rec.setCurrentLineItemValue('item', 'class', item_classid);

		if (!isEmpty(addlChargeRate)) {
			// var chargeAmt = getFloatVal(addlChargeRate) *
			// getIntVal(itemQty);
			// dLog('createTradingorder', 'setting charge rate | chargeAmt = ' +
			// chargeAmt);
			rec.setCurrentLineItemValue('item', 'rate', addlChargeRate);
			if (!isEmpty(addlChargeAmt))
				rec.setCurrentLineItemValue('item', 'amount', addlChargeAmt);
		}

		if (!isEmpty(addlChargeAmt)) {

			// var chargeAmt = getFloatVal(addlChargeAmt) *
			// getIntVal(itemQty);
			// dLog('createTradingorder', 'setting charge amount | chargeAmt = '
			// + chargeAmt);
			// rec.setCurrentLineItemValue('item', 'description', 'Qty : ' +
			// itemQty + ' | Rate : ' + addlChargeAmt);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', addlChargeAmt);
		}

		if (!isEmpty(objBPOLineInfo))
			setTransCols(rec, objBPOLineInfo);

		if (!isEmpty(compoItem)) {
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compoItem);
			var componame = nlapiLookupField('item', compoItem, 'displayname');
			dLog('setAddlCharge', 'Composite Name is ' + componame);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
		}

		rec.commitLineItem('item');

		dLog('setAddlCharge', 'Set Addl Charge line..');

		// subtotal
		var currAmt = rec.getCurrentLineItemValue('item', 'amount');
		subTotal += getFloatVal(currAmt);

		setSubTotal(rec, subTotal);
	}

	return subTotal;
}

/**
 * Utility function to trim white space
 */
function trimX(str) {
	if (isEmpty(str))
		return '';

	return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
}

/**
 * 
 */
function removeDuplicates(array) {
	if (isEmpty(array)) {
		return array;
	}

	var arrNew = new Array();
	o: for (var i = 0, n = array.length; i < n; i++) {
		for (var x = 0, y = arrNew.length; x < y; x++) {
			if (arrNew[x] == array[i]) {
				continue o;
			}
		}

		arrNew[arrNew.length] = array[i];
	}

	return arrNew;
}

function setValue(fldValue) {
	if (isEmpty(fldValue))
		return '';

	return fldValue;
}

function isEmpty(fldValue) {
	return fldValue == '' || fldValue == null || fldValue == undefined;
}

/**
 * 
 */
function getFloatVal(val) {
	return isEmpty(val) ? 0.00 : parseFloat(val);
}

/**
 * 
 * @param fldValue
 * @returns
 */
function getIntVal(fldValue) {
	if (isEmpty(fldValue))
		return 0;

	return parseInt(fldValue);
}

/**
 * 
 * @param {Object}
 *            logTitle
 * @param {Object}
 *            logDetails
 */
function dAudit(logTitle, logDetails) {
	nlapiLogExecution('AUDIT', logTitle, logDetails);
}

function dLog(logTitle, logDetails) {
	nlapiLogExecution('DEBUG', logTitle, logDetails);
}

// added by Herman to check if date is in closed period
function periodClosed(mystringdate) {
	var months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
	var mydate = nlapiStringToDate(mystringdate);
	var postingPeriod = months[mydate.getMonth()] + ' ' + mydate.getFullYear();
	var rs = nlapiSearchRecord('accountingperiod', null, new nlobjSearchFilter('periodname', null, 'is', postingPeriod), new nlobjSearchColumn('closed'));

	return (rs) ? rs[0].getValue('closed') : '';
}

function getContainerDetails(asnId) {

	var arrMap = [];
	var rs = nlapiSearchRecord(null, 'customsearch_asn_line_container_details', new nlobjSearchFilter('custrecord_ts_created_fm_asn', null, 'anyOf', asnId));
	for (var i = 0; rs != null && i < rs.length; i++) {
		var asnLineId = rs[i].getId();
		var containerNum = rs[i].getValue('custrecord_ctnr_dtl_ctnr_num', 'CUSTRECORD_CTNR_DTL_ASN_ITEM_LINE');

		if (arrMap[asnLineId] == null)
			arrMap[asnLineId] = [];

		if (!isEmpty(containerNum))
			arrMap[asnLineId].push(containerNum + '(' + rs[i].getValue('custrecord_ts_ctnr_dtl_asn_item_qty', 'CUSTRECORD_CTNR_DTL_ASN_ITEM_LINE') + ')');
	}

	return arrMap;
}

function batchcontrol_update(rec) {
	// Added by Herman for Batch Control
	var batchcode = rec.getFieldValue('custrecord_ts_asn_batch_code');
	var batch_control_col = new Array();
	batch_control_col.push(new nlobjSearchColumn('internalid'));
	var batch_control_criteria = new Array();
	batch_control_criteria.push(new nlobjSearchFilter('name', null, 'is', batchcode));
	var batchcontrolsr = nlapiSearchRecord('customrecord_ts_asn_batch_control', null, batch_control_criteria, batch_control_col);
	if (batchcontrolsr) {
		var batchcontrol_id = batchcontrolsr[0].getValue('internalid');
		var batchcurrentcount = nlapiLookupField('customrecord_ts_asn_batch_control', batchcontrol_id, 'custrecord_current_count');
		dLog(LOG_NAME, 'Current Count = ' + batchcurrentcount);
		var new_currentcount = parseInt(batchcurrentcount);
		new_currentcount++;
		dLog(LOG_NAME, 'New Current Count = ' + new_currentcount);
		nlapiSubmitField('customrecord_ts_asn_batch_control', batchcontrol_id, 'custrecord_current_count', new_currentcount);
	}

}

function transformToInvoice(soId, asnId, billId, rec, jobName, rs) {

	try {
		var asnActualOnboardDate = rec.getFieldValue('custrecord_asn_actual_onboard_dd');
		var blanketPO = rs[0].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var recSO = nlapiLoadRecord('salesorder', soId);
		var soLine = recSO.getLineItemCount('item');

		// transform SO to Invoice.
		var recInv = nlapiTransformRecord('salesorder', soId, 'invoice', {
			recordmode : 'dynamic',
			customform : FORM_TS_PRODUCT_INVOICE
		});

		var custTerms = recInv.getFieldValue('terms');
		dLog('transformToInvoice', 'Terms = ' + custTerms);

		var termDays = 0;

		if (custTerms == TERMS_SUPPLIER && !isEmpty(blanketPO)) {
			var blanketPOTerms = nlapiLookupField('customrecord_ts_blanket_po', blanketPO, 'custrecord_ts_bpo_pyt_terms');

			if (!isEmpty(blanketPOTerms)) {
				termDays = getTermDays(blanketPOTerms);
				recInv.setFieldValue('terms', blanketPOTerms);
			}

		} else if (!isEmpty(custTerms)) {
			termDays = getTermDays(custTerms);
		}

		dLog('transformToInvoice', 'Term Days = ' + termDays);
		if (!isEmpty(jobName))
			recInv.setFieldText('job', jobName);

		recInv.setFieldValue('duedate', nlapiDateToString(nlapiAddDays(getTSHKCurrentDateTime(), termDays)));
		recInv.setFieldValue('custbody_ts_invoice_inv_type', INVOICE_TYPE_A_TRADE_AUTO_INVOICE);
		recInv.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		recInv.setFieldValue('custbody_ts_inv_send_inv_and_sd', rs[0].getValue('custrecord_ts_asn_send_invoice_n_doc'));

		if (!isEmpty(billId))
			recInv.setFieldValue('custbody_ts_ap_related_v_bill', billId);

		if (!isEmpty(asnActualOnboardDate))
			recInv.setFieldValue('shipdate', asnActualOnboardDate);

		for (var i = 1; i <= soLine; i++) {
			recInv.setLineItemValue('item', 'rate', i, recSO.getLineItemValue('item', 'rate', i));
		}

		var invId = nlapiSubmitRecord(recInv, true, true);

		dAudit('transformToInvoice', 'Invoice created | id = ' + invId);

		return invId;

	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Invoice Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Invoice Creation Error: ' + e.toString();
		}

		dLog('Invoice Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);
	}
}

function getTSHKCurrentDateTime(){
	var currentDateTime = new Date(); // Current date time in Server
	var subsid = nlapiLoadRecord('subsidiary', SUB_THREESIXTY_HK);
	var subsidTimeZone = subsid.getFieldText('TIMEZONE');
	var timeZoneOffSet = (subsidTimeZone.indexOf('(GMT)') === 0) ? 0 : new Number(subsidTimeZone.substr(4, 6).replace(/\+|:00/gi, '').replace(/:30/gi, '.5'));
	var UTC = currentDateTime.getTime() + (currentDateTime.getTimezoneOffset() * 60000);
	var hkDateTime = UTC + (timeZoneOffSet * 60 * 60 * 1000);
    var hk_date = new Date(hkDateTime);
    return hk_date;
}

function calculatepayweek(duedate){
	 
	  var myduedate = nlapiStringToDate(duedate);
	  // nlapiLogExecution('debug', 'CALCPAYWEEK', myduedate);
	  var day = myduedate.getDay();
	  var mypaydate = '';
	 
	  if (day == '0') 
	      mypaydate = nlapiAddDays(myduedate, 12);
	  else if (day == '1')
	      mypaydate = nlapiAddDays(myduedate, 11);
	  else if (day == '2')
	      mypaydate = nlapiAddDays(myduedate, 10);
	  else if (day == '3')
	      mypaydate = nlapiAddDays(myduedate, 9);
	  else if (day == '4')
	      mypaydate = nlapiAddDays(myduedate, 8);
	  else if (day == '5')
	      mypaydate = nlapiAddDays(myduedate, 7);
	  else if (day == '6')
	      mypaydate = nlapiAddDays(myduedate, 13);
	 
	  var payweek = nlapiDateToString(mypaydate, 'date');
	  return payweek;
	  
	}

//Search Matching Sourcing Fee record helper function
function get_matching_sf( sf_searchResults, cust_id, cust_group, supplier, factory ) {
 
  var index;
 
  if ( sf_searchResults.length == 0 || sf_searchResults == null )
    return null;
 
  // Init columns
  var sf_custid_col   = new nlobjSearchColumn( 'custrecord_sourcingfee_customercode' );
  var sf_custgrp_col  = new nlobjSearchColumn( 'custrecord_sourcingfee_customergrp' );
  var sf_supplier_col = new nlobjSearchColumn( 'custrecord_sourcingfee_supplier' );
  var sf_factory_col  = new nlobjSearchColumn( 'custrecord_sourcing_fty' );
 
  var sf_agent_col    = new nlobjSearchColumn( 'custrecord_sourcingfee_sourcingagent' );
  var sf_commis_col   = new nlobjSearchColumn( 'custrecord_sourcingfee_commis' );
 
  // Init result object
  var sf_obj = new Object();
 
  // Filter 1 
  for ( index = 0; index < sf_searchResults.length; index ++ ) {
 
    var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
    var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
    var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
    var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null; 
 
    if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == supplier && sf_factory == factory ) {
       
       sf_obj.id     = sf_searchResults[index].getId();
       sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
       sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
       sf_obj.filter = 1;
 
       return sf_obj;
 
    }
 
  }
 
  // Filter 2
  for ( index = 0; index < sf_searchResults.length; index ++ ) {
 
    var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
    var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
    var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
    var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;
 
    if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == supplier && sf_factory == null ) {
             
       sf_obj.id     = sf_searchResults[index].getId();
       sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
       sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
       sf_obj.filter = 2;
 
       return sf_obj;
 
    }
 
  }
 
  // Filter 3
  for ( index = 0; index < sf_searchResults.length; index ++ ) {
 
    var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
    var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
    var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
    var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;
 
    if ( sf_custid == cust_id && sf_custgrp == cust_group && sf_supplier == null && sf_factory == null ) {
       
       sf_obj.id     = sf_searchResults[index].getId();
       sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
       sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
       sf_obj.filter = 3;
 
 
       return sf_obj;
       
    }
 
  }
 
  // Filter 4
  for ( index = 0; index < sf_searchResults.length; index ++ ) {
 
    var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
    var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
    var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
    var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;
 
    if ( sf_custid == cust_id && sf_custgrp == null && sf_supplier == null && sf_factory == null ) {
       
       sf_obj.id     = sf_searchResults[index].getId();
       sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
       sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
       sf_obj.filter = 4;
 
       return sf_obj;
       
    }
 
  }
 
  // Filter 5
  for ( index = 0; index < sf_searchResults.length; index ++ ) {
 
    var sf_custid   = sf_searchResults[index].getValue( sf_custid_col ) ? sf_searchResults[index].getValue( sf_custid_col ) : null;
    var sf_custgrp  = sf_searchResults[index].getValue( sf_custgrp_col ) ? sf_searchResults[index].getValue( sf_custgrp_col ) : null;
    var sf_supplier = sf_searchResults[index].getValue( sf_supplier_col ) ? sf_searchResults[index].getValue( sf_supplier_col ) : null;
    var sf_factory  = sf_searchResults[index].getValue( sf_factory_col ) ? sf_searchResults[index].getValue( sf_factory_col ) : null;
 
    if ( sf_custgrp == cust_group && sf_custid == null && sf_supplier == null && sf_factory == null ) {
       
       sf_obj.id     = sf_searchResults[index].getId();
       sf_obj.agent  = sf_searchResults[index].getValue( sf_agent_col );
       sf_obj.commis = sf_searchResults[index].getValue( sf_commis_col );
       sf_obj.filter = 5;
 
       return sf_obj;
       
    }
 
  }
 
  return null;
 
}

function getTSUserCurrentDateTime(){
    var currentDateTime = new Date(); // Current date time in Server
    var userid =nlapiGetUser();
    var usersubsid = nlapiLookupField('employee',userid,'subsidiary');
    var subsid = nlapiLoadRecord('subsidiary', usersubsid);
    var subsidTimeZone = subsid.getFieldText('TIMEZONE');
    var timeZoneOffSet = (subsidTimeZone.indexOf('(GMT)') === 0) ? 0 : new Number(subsidTimeZone.substr(4, 6).replace(/\+|:00/gi, '').replace(/:30/gi, '.5'));
    var UTC = currentDateTime.getTime() + (currentDateTime.getTimezoneOffset() * 60000);
    var userDateTime = UTC + (timeZoneOffSet * 60 * 60 * 1000);
    var user_date = new Date(userDateTime);
    return user_date;
}