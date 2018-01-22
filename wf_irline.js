var STAT_APPROVED = 1;

/**
 * For every IRL with an 'Override Approval Status' of 'Final Approved', the
 * script will check the value of the fields 'Inspection Quantity' and 'Related
 * RL Line#'.
 * 
 * 
 * @returns
 */
function doIRL() {

	try {
      	var recId = nlapiGetRecordId();
		var IRL = nlapiLoadRecord('customrecord_ts2_irl', recId);
		var ir = IRL.getFieldValue('custrecord_ts2_irl_ir_no');// nlapiGetFieldValue('custrecord_ts2_irl_ir_no');
		var poId = IRL.getFieldValue('custrecord_ts2_irl_related_rlpol');// nlapiGetFieldValue('custrecord_ts2_irl_related_rlpol');

		dLog('doIRL', 'IR Id : ' + ir);
		dLog('doIRL', 'PO Id : ' + poId);

		if (isEmpty(ir)) {
			dLog('doIRL', 'Empty IR, exit function.');
			return;
		}
		if (isEmpty(poId)) {

			dLog('doIRL', 'Empty PO, exit function.');
			return;
		}

		var objIR = nlapiLookupField('customrecord_ts2_ir', ir, ['custrecord_ts2_ir_app_status', 'custrecord_ts2_ir_result'])

		dLog('doIRL', 'custrecord_ts2_ir_app_status : ' + objIR.custrecord_ts2_ir_app_status);
		dLog('doIRL', 'custrecord_ts2_ir_result : ' + objIR.custrecord_ts2_ir_result);

		if (objIR.custrecord_ts2_ir_app_status == STAT_APPROVED) {

			var arrPOTotalAcptedQty = getTotalAcceptedQty(poId);

			for (x in arrPOTotalAcptedQty) {

				var objPo = nlapiLookupField('purchaseorder', x, ['custbody_ts2_rspol_qty','custbody_ts2_rlpol_tt_ord_qty', 'custbody_ts2_rlpol_tt_rtn_qty', 'custbody_ts2_rlpol_tt_shipped_qty',
						'custbody_ts2_rlpol_non_inspec_qty', 'custbody_ts2_rlpol_tt_exp_qty']);

				var newShippableQty = getFloatValue(arrPOTotalAcptedQty[x]) + getFloatValue(objPo.custbody_ts2_rlpol_tt_rtn_qty)
						- getFloatValue(objPo.custbody_ts2_rlpol_tt_shipped_qty) + getFloatValue(objPo.custbody_ts2_rlpol_non_inspec_qty)
						+ getFloatValue(objPo.custbody_ts2_rlpol_tt_ord_qty) + getFloatValue(objPo.custbody_ts2_rlpol_tt_exp_qty);
				var newNotyetQty = getFloatValue(objPo.custbody_ts2_rspol_qty) - getFloatValue(arrPOTotalAcptedQty[x]) - getFloatValue(objPo.custbody_ts2_rlpol_non_inspec_qty)
						- getFloatValue(objPo.custbody_ts2_rlpol_tt_ord_qty) - getFloatValue(objPo.custbody_ts2_rlpol_tt_exp_qty);

				dLog('doIRL', 'Updating PO Total Accepted Qty | id : ' + x + ' | Accepted qty = ' + arrPOTotalAcptedQty[x] + ' | Shippable Qty = ' + newShippableQty);

				nlapiSubmitField('purchaseorder', x, ['custbody_ts2_rlpol_not_yet_inspect_qty','custbody_ts2_rlpol_shippable_qty', 'custbody_ts2_rlpol_tt_acc_qty'], [newNotyetQty, newShippableQty, arrPOTotalAcptedQty[x]]);
			}

			var arrOQMap = getOverridenQty(poId);

			for (y in arrOQMap) {

				var objPo = nlapiLookupField('purchaseorder', y, ['custbody_ts2_rspol_qty','custbody_ts2_rlpol_tt_rtn_qty', 'custbody_ts2_rlpol_tt_shipped_qty', 'custbody_ts2_rlpol_non_inspec_qty',
						'custbody_ts2_rlpol_tt_acc_qty', 'custbody_ts2_rlpol_tt_exp_qty']);

				var newShippableQty = getFloatValue(arrOQMap[y]) + getFloatValue(objPo.custbody_ts2_rlpol_tt_rtn_qty) - getFloatValue(objPo.custbody_ts2_rlpol_tt_shipped_qty)
						+ getFloatValue(objPo.custbody_ts2_rlpol_non_inspec_qty) + getFloatValue(objPo.custbody_ts2_rlpol_tt_acc_qty)
						+ getFloatValue(objPo.custbody_ts2_rlpol_tt_exp_qty);
				var newNotyetQty = getFloatValue(objPo.custbody_ts2_rspol_qty) - getFloatValue(arrOQMap[y]) - getFloatValue(objPo.custbody_ts2_rlpol_non_inspec_qty)
						- getFloatValue(objPo.custbody_ts2_rlpol_tt_acc_qty) - getFloatValue(objPo.custbody_ts2_rlpol_tt_exp_qty);

				dLog('doIRL', 'Updating PO Total Overriden Qty | id : ' + y + ' | Overriden qty = ' + arrOQMap[y] + ' | Shippable Qty = ' + newShippableQty);

				nlapiSubmitField('purchaseorder', y, ['custbody_ts2_rlpol_not_yet_inspect_qty','custbody_ts2_rlpol_shippable_qty', 'custbody_ts2_rlpol_tt_ord_qty'], [newNotyetQty, newShippableQty, arrOQMap[y]]);
			}
		}

	} catch (e) {
		erroLog(e, 'doIRL');
	}
}

/**
 * The script will add the 'Inspection Quantity' value of the IRL with an
 * 'Accepted' status on top of the pre-existing 'Total Accepted Quantity' of the
 * 'Related RL Line#'.
 * 
 * 
 * @param ir
 * @returns
 */
function getTotalAcceptedQty(po) {
	try {

		dLog('getTotalAcceptedQty', 'filter po : ' + po);
		var arrPO = [];

		// For every IRL with an 'Inspection Result' field value of 'Accepted',
		// the script will check the value of the fields 'Inspection Quantity'
		// and 'Related RL Line#'.

		var filters = [];
		var columns = [];
		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_inspection_result', null, 'anyOf', '1'));
		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_related_rlpol', null, 'noneOf', '@NONE@'));

		// if (obj.ir)
		// filters.push(new nlobjSearchFilter('custrecord_ts2_irl_ir_no', null,
		// 'anyOf', obj.ir));

		if (po)
			filters.push(new nlobjSearchFilter('custrecord_ts2_irl_related_rlpol', null, 'anyOf', po));

		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_ir_no"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_inspection_result"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_related_rlpol"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_ins_qtt"));

		var rs = nlapiSearchRecord("customrecord_ts2_irl", null, filters, columns);

		for (var i = 0; rs != null && i < rs.length; i++) {

			var poId = rs[i].getValue('custrecord_ts2_irl_related_rlpol');
			var inspQty = rs[i].getValue('custrecord_ts2_irl_ins_qtt');

			if (isEmpty(inspQty))
				continue;

			dLog('getTotalAcceptedQty', 'IRL id : ' + rs[i].getId() + ' | po Id : ' + poId);

			if (arrPO[poId] == null)
				arrPO[poId] = 0;

			arrPO[poId] += parseFloat(inspQty);
		}

		return arrPO;

	} catch (e) {

		erroLog(e, 'updateRLPO');
	}
}

/**
 * 
 * @param po
 * @returns
 */
function getOverridenQty(po) {
	try {

		dLog('getOverridenQty', 'filter po : ' + po);

		var arrPO = [];

		// The script will add the 'Inspection Quantity' value of the IRL with
		// an 'Final Approved' 'Override Approval Status' on top of the
		// pre-existing 'Total Overridden Quantity' of the 'Related RL Line#'.

		var filters = [];
		var columns = [];
		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_override_app_status', null, 'anyOf', '3'));
		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_related_rlpol', null, 'noneOf', '@NONE@'));

		// if (obj.ir)
		// filters.push(new nlobjSearchFilter('custrecord_ts2_irl_ir_no', null,
		// 'anyOf', obj.ir));

		if (po)
			filters.push(new nlobjSearchFilter('custrecord_ts2_irl_related_rlpol', null, 'anyOf', po));

		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_ir_no"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_inspection_result"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_related_rlpol"));
		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_ins_qtt"));

		var rs = nlapiSearchRecord("customrecord_ts2_irl", null, filters, columns);

		for (var i = 0; rs != null && i < rs.length; i++) {

			var poId = rs[i].getValue('custrecord_ts2_irl_related_rlpol');
			var inspQty = rs[i].getValue('custrecord_ts2_irl_ins_qtt');

			if (isEmpty(inspQty))
				continue;

			dLog('getOverridenQty', 'IRL id : ' + rs[i].getId() + ' | po Id : ' + poId);

			if (arrPO[poId] == null)
				arrPO[poId] = 0;

			arrPO[poId] += parseFloat(inspQty);
		}

		return arrPO;

	} catch (e) {
		erroLog(e, 'getOverridenQty');
	}
}

function getIRRelatedPO(ir) {
	try {

		var arrPO = [];
		var filters = [];
		var columns = [];

		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_inspection_result', null, 'anyOf', '1'));
		// filters.push(new
		// nlobjSearchFilter('custrecord_ts2_irl_override_app_status', null,
		// 'anyOf', '3'));
		filters.push(new nlobjSearchFilter('custrecord_ts2_irl_related_rlpol', null, 'noneOf', '@NONE@'));

		if (ir)
			filters.push(new nlobjSearchFilter('custrecord_ts2_irl_ir_no', null, 'anyOf', ir));

		columns.push(new nlobjSearchColumn("custrecord_ts2_irl_related_rlpol"));

		var rs = nlapiSearchRecord("customrecord_ts2_irl", null, filters, columns);

		for (var i = 0; rs != null && i < rs.length; i++) {

			var poId = rs[i].getValue('custrecord_ts2_irl_related_rlpol');

			if (poId)
				arrPO.push(poId);
		}

		return arrPO;
	} catch (e) {
		erroLog(e, 'getIRRelatedPO');
	}
}

function erroLog(e, funcName) {

	var stErrMsg = '';
	if (e.getDetails !== undefined) {
		stErrMsg = funcName + ' : ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
	} else {
		stErrMsg = funcName + ' : ' + e.toString();
	}

	dLog(funcName + '| Script Error', stErrMsg);
}

/**
 * 
 * @param fldValue
 * @returns
 */
function getFloatValue(fldValue) {
	if (isEmpty(fldValue))
		return 0.0;

	return parseFloat(fldValue);
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

function isEmpty(fldValue) {
	return fldValue == '' || fldValue == null || fldValue == undefined;
}