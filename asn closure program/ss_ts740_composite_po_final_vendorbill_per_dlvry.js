var LOG_NAME = 'schedProcessCompositePO';

/**
 * 
 * @param rec
 */
function schedProcessCompositePO() {

	var paramSNId = nlapiGetContext().getSetting('SCRIPT', 'custscript_compositepo_t40_asn_id');
	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);

	// Added by Herman for Batch Control
	batchcontrol_update(rec);

	var rs = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', paramSNId));

	if (rs == null) {
		dLog(LOG_NAME, 'No ASN to process. Exit script.');
		return;
	}

	var custId = rs[0].getValue('custrecord_asn_bill_to_customer');
	dLog(LOG_NAME, 'custId = ' + custId);

	// Determine Customer Billing Type
	var custBillingType = nlapiLookupField('customer', custId, 'custentity_ts_customer_billing_type');
	dLog(LOG_NAME, 'Customer Billing Type = ' + custBillingType);

	var arrPO = [];
	var arrPOASNMap = [];
	var arrItemId = [];
	var arrCompItemId = [];
	var arrASNLineData = [];
	var arrItemTypeMap = getASNItemType(rs);
	var invJob = '';

	// loop through ASN line
	for (var i = 0; i < rs.length; i++) {

		var item = rs[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var compositeItem = rs[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var releaseShipmentPO = rs[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var asnLine = rs[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPO = rs[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPOTxt = rs[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var custPONo = rs[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var itemQty = rs[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');

		dLog(LOG_NAME, 'Item = ' + item);
		dLog(LOG_NAME, 'Composite Item = ' + compositeItem);
		dLog(LOG_NAME, 'Quantity = ' + itemQty);
		dLog(LOG_NAME, 'Release Shipment PO = ' + releaseShipmentPO);
		dLog(LOG_NAME, 'ASN Line Id = ' + asnLine);
		dLog(LOG_NAME, 'Blanket PO Id = ' + blanketPO);
		dLog(LOG_NAME, 'Blanket PO Name = ' + blanketPOTxt);
		dLog(LOG_NAME, 'Customer PO No. = ' + custPONo);

		arrPO.push(releaseShipmentPO);

		arrPOASNMap[releaseShipmentPO] = {
			asnline : asnLine,
			bpoline : blanketPO,
			shipmentpo : releaseShipmentPO,
			custpono : custPONo
		};

		if (!isEmpty(item))
			arrItemId.push(item);

		// component check data
		if ((arrItemTypeMap[item] == 'OthCharge'))
			continue;

		arrASNLineData.push({
			compoitem : compositeItem,
			finalitem : item,
			asnlineqty : itemQty
		});

		if (!isEmpty(custPONo))
			invJob = custPONo;
	}

	arrPO = removeDuplicates(arrPO);

	// Check local components
	var hasEnoughQty = hasEnoughComponents(arrASNLineData);
	dLog(LOG_NAME, 'hasEnoughQty = ' + hasEnoughQty);

	if (!hasEnoughQty) {

		raiseError(paramSNId);
		// (ONE103: Insufficient Quantity of local components). Change status of
		// ASN to ERROR..
		dLog(LOG_NAME, 'ONE0909-3: Insufficient Quantity. Set to ERROR.');
		rec.setFieldValue('custrecord_asn_status', ASN_STAT_ERROR_QUANTITY);
		nlapiSubmitRecord(rec, true, true);

	} else {

		if (custBillingType == CUST_BILLING_TYPE_AGENCY) {

			var arrIRId = receiptPO(arrPO, paramSNId, true);

			if (arrIRId.length > 0) {

				var isCloseOk = closePO(arrPO);

				if (isCloseOk) {

					var isAdjOk = createAdjustment(custId, arrIRId[0], paramSNId);

					if (isAdjOk) {
						var soId = ts740_createCompositeAgencyOrder(rs, paramSNId);

						if (!isEmpty(soId)) {

							var invId = transformToInvoice(soId, paramSNId, '', rec, invJob, rs);
							// rec.setFieldValue('custrecord_ts_asn_customer_inv_no',
							// invId);
							// rec.setFieldValue('custrecord_asn_reset', 'F');

							// updated ASN record
							// nlapiSubmitRecord(rec, true, true);

							nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ invId, 'F' ]);
						}
					}
				}
			}
		} else {

			// As per Herman on 26 Jun 2016: comment out po receipt for
			// principal
			// and trading
			// var arrIR = receiptPO(arrPO, paramSNId, false);

			var billId = transformPOToBill(arrPO, rec, arrPOASNMap, rs);

			if (billId) {

				closePO(arrPO);

				var soId = '';

				if (custBillingType == CUST_BILLING_TYPE_PRINCIPAL) {

					soId = ts740_createCompositePrincipalOrder(rs, paramSNId);

				} else if (custBillingType == CUST_BILLING_TYPE_TRADING) {

					soId = ts740_createCompositeTradingOrder(rs, paramSNId);
				}

				if (!isEmpty(soId)) {
					
					var salesorderstatus = nlapiLookupField('salesorder', soId, 'status');
					if (salesorderstatus == 'pendingFulfillment')
						transformToFulfillment(soId, paramSNId);

					var invId = transformToInvoice(soId, paramSNId, billId, rec, invJob, rs);
					// rec.setFieldValue('custrecord_asn_vendor_bill_no',
					// billId);
					// rec.setFieldValue('custrecord_ts_asn_customer_inv_no',
					// invId);
					// rec.setFieldValue('custrecord_asn_reset', 'F');

					// updated ASN record
					nlapiSubmitField('customrecord_ts_asn', paramSNId, [ 'custrecord_asn_vendor_bill_no', 'custrecord_ts_asn_customer_inv_no', 'custrecord_asn_reset' ], [ billId, invId, 'F' ]);
				}
			}
		}
	}
}

function ts740_createCompositeAgencyOrder(objRS, asnId) {
	try {
		dLog('ts740_createCompositeAgencyOrder', '>>>>>>>>>>>>>>>');

		var rec = nlapiCreateRecord('salesorder', {
			recordmode : 'dynamic',
			customform : FORM_TS_SALES_ORDER,
			entity : objRS[0].getValue('custrecord_asn_bill_to_customer')
		});

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));
		rec.setFieldValue('location', LOC_THREESIXTY);

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];

		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemTypeMap = getASNItemType(objRS);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			var itemTxt = objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;

			dLog('ts740_createCompositeAgencyOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts740_createCompositeAgencyOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// agency
			var amtAgency = getFloatVal(itemRate) * getIntVal(itemQty);
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
            rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // 14-Dec-2016 - HY for issue# 309
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_item_name', itemTxt);

			if (!isEmpty(compositeItem)){
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				var componame = nlapiLookupField('item',compositeItem,'displayname');
				dLog('ts740_createCompositeAgencyOrder', 'Composite Name is ' + componame);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
			}


			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			var itemType = arrItemTypeMap[item];
			var itemToSet = (itemType != 'OthCharge') ? ITEM_AGENCY : item;

			rec.setCurrentLineItemValue('item', 'item', itemToSet);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', itemRate);
			rec.setCurrentLineItemValue('item', 'amount', amtAgency);
			rec.commitLineItem('item');

			dLog('ts740_createCompositeAgencyOrder', 'Set Agency line..');

			subTotal += amtAgency;

			if (!isEmpty(arrBPOMap[blanketPOLine])) {

				// additional charge
				var addlChargeRate = arrBPOMap[blanketPOLine].adlchrgepercent;
				var addlChargeAmt = arrBPOMap[blanketPOLine].adlchrgeunit;
				var chargeItem = arrBPOMap[blanketPOLine].charge_item;

				dLog('ts740_createCompositeAgencyOrder', 'addlChargeRate = ' + addlChargeRate);
				dLog('ts740_createCompositeAgencyOrder', 'addlChargeAmt = ' + addlChargeAmt);
				dLog('ts740_createCompositeAgencyOrder', 'chargeItem = ' + chargeItem);

				if (!isEmpty(chargeItem)) {

					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', chargeItem);

					if (!isEmpty(addlChargeRate)) {
						var chargeAmt = getFloatVal(addlChargeRate) * getIntVal(itemQty);
						dLog('ts740_createCompositeAgencyOrder', 'setting charge rate |  chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'rate', addlChargeRate);
						rec.setCurrentLineItemValue('item', 'amount', chargeAmt);
					}

					if (!isEmpty(addlChargeAmt)) {

						var chargeAmt = getFloatVal(addlChargeAmt) * getIntVal(itemQty);
						dLog('ts740_createCompositeAgencyOrder', 'setting charge amount | chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'description', 'Qty : ' + itemQty + ' | Rate : ' + addlChargeAmt);
						rec.setCurrentLineItemValue('item', 'price', -1);
						rec.setCurrentLineItemValue('item', 'rate', chargeAmt);
					}

					if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
						setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

					if (!isEmpty(compositeItem)){
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
						var componame = nlapiLookupField('item',compositeItem,'displayname');
						dLog('ts740_createCompositeAgencyOrder', 'Composite Name is ' + componame);
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
					}


					rec.commitLineItem('item');

					dLog('ts740_createCompositeAgencyOrder', 'Set Addl Charge line..');

					// subtotal
					var currAmt = rec.getCurrentLineItemValue('item', 'amount');
					subTotal += getFloatVal(currAmt);
					setSubTotal(rec, subTotal);
				}
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);

				if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

					if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepayto))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', arrBPOLineInfo[blanketPOLine].adlchrgepayto);
					if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepercent))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', arrBPOLineInfo[blanketPOLine].adlchrgepercent);
					if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgeunit))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', arrBPOLineInfo[blanketPOLine].adlchrgeunit);
					if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
					if (!isEmpty(arrBPOLineInfo[blanketPOLine].htscode))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', arrBPOLineInfo[blanketPOLine].htscode);
				}

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

				if (!isEmpty(compositeItem)){
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
					var componame = nlapiLookupField('item',compositeItem,'displayname');
					dLog('ts740_createCompositeAgencyOrder', 'Composite Name is ' + componame);
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
				}


				rec.commitLineItem('item');

				dLog('ts740_createCompositeAgencyOrder', 'Set Gross Margin line..');

				// subtotal
				setSubTotal(rec, subTotal);
			}

			if (itemType != 'OthCharge') {
				// offset item
				var amtOffSet = amtAgency * -1;
				subTotal += amtOffSet;
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_OFFSET);
				rec.setCurrentLineItemValue('item', 'quantity', itemQty);
				rec.setCurrentLineItemValue('item', 'amount', amtOffSet);

				if (!isEmpty(compositeItem)){
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
					var componame = nlapiLookupField('item',compositeItem,'displayname');
					dLog('ts740_createCompositeAgencyOrder', 'Composite Name is ' + componame);
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
				}

				
				rec.commitLineItem('item');

				dLog('ts740_createCompositeAgencyOrder', 'Set Offset line..');

				// subtotal
				setSubTotal(rec, subTotal);
			}
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts740_createCompositeAgencyOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}

function ts740_createCompositePrincipalOrder(objRS, asnId) {
	try {
		dLog('ts740_createCompositePrincipalOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Item Ids
		var arrItemId = [];
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);
		var blanketPOName = '';

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			blanketPOName = objRS[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var msRelItemNo = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_ms_release_item_no');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
          	var itemname = nlapiLookupField('item', item, 'itemid');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			if (!isEmpty(msRelItemNo))
				customerItemNo = msRelItemNo;	
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
          	var item_desc = arrBPOLineInfo[blanketPOLine].itemdesc ;
			dLog('ts740_createCompositePrincipalOrder', 'item_desc yyyy= ' + item_desc);
			var subTotal = 0;
			var asnAmt = 0;

			dLog('ts740_createCompositePrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts740_createCompositePrincipalOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
            rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // 14-Dec-2016 - HY for issue# 309
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', item);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', itemRate);
          	rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
			rec.setCurrentLineItemValue('item', 'description', item_desc);
			
			// added by HY 8-Sept-2016
			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			if (arrItemLotMap[item] == 'T') {

				dLog('ts740_createCompositePrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo
						+ ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('ts740_createCompositePrincipalOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

				dLog('ts740_createCompositePrincipalOrder', 'Blanket Info = ' + JSON.stringify(arrBPOLineInfo[blanketPOLine]));

				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepayto))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', arrBPOLineInfo[blanketPOLine].adlchrgepayto);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepercent))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', arrBPOLineInfo[blanketPOLine].adlchrgepercent);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgeunit))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', arrBPOLineInfo[blanketPOLine].adlchrgeunit);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].htscode))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', arrBPOLineInfo[blanketPOLine].htscode);
			}

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			if (!isEmpty(compositeItem)){
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				var componame = nlapiLookupField('item',compositeItem,'displayname');
				dLog('ts740_createCompositePrincipalOrder', 'Composite Name is ' + componame);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
			}

			rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
			rec.commitLineItem('item');

			dLog('ts740_createCompositePrincipalOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {

				// additional charge
				var addlChargeRate = arrBPOMap[blanketPOLine].adlchrgepercent;
				var addlChargeAmt = arrBPOMap[blanketPOLine].adlchrgeunit;
				var chargeItem = arrBPOMap[blanketPOLine].charge_item;

				dLog('ts740_createCompositePrincipalOrder', 'addlChargeRate = ' + addlChargeRate);
				dLog('ts740_createCompositePrincipalOrder', 'addlChargeAmt = ' + addlChargeAmt);
				dLog('ts740_createCompositePrincipalOrder', 'chargeItem = ' + chargeItem);

				if (!isEmpty(chargeItem)) {

					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', chargeItem);

					if (!isEmpty(addlChargeRate)) {
						var chargeAmt = getFloatVal(addlChargeRate) * getIntVal(itemQty);
						dLog('ts740_createCompositePrincipalOrder', 'setting charge rate |  chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'rate', addlChargeRate);
						rec.setCurrentLineItemValue('item', 'amount', chargeAmt);
                        rec.setCurrentLineItemValue('item', 'description', item_desc);
					}

					if (!isEmpty(addlChargeAmt)) {

						var chargeAmt = getFloatVal(addlChargeAmt) * getIntVal(itemQty);
						dLog('ts740_createCompositePrincipalOrder', 'setting charge amount | chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'description', 'Qty : ' + itemQty + ' | Rate : ' + addlChargeAmt);
						rec.setCurrentLineItemValue('item', 'price', -1);
						rec.setCurrentLineItemValue('item', 'rate', chargeAmt);
					}

					if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepayto))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', arrBPOLineInfo[blanketPOLine].adlchrgepayto);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepercent))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', arrBPOLineInfo[blanketPOLine].adlchrgepercent);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgeunit))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', arrBPOLineInfo[blanketPOLine].adlchrgeunit);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].htscode))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', arrBPOLineInfo[blanketPOLine].htscode);
					}
					if (!isEmpty(compositeItem)){
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
						var componame = nlapiLookupField('item',compositeItem,'displayname');
						dLog('ts740_createCompositePrincipalOrder', 'Composite Name is ' + componame);
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
					}
					
					rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
					rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // //3rd feb 2017 ref Dennis email 810 import format
					rec.commitLineItem('item');

					dLog('ts740_createCompositePrincipalOrder', 'Set Addl Charge line..');

					// subtotal
					var currAmt = rec.getCurrentLineItemValue('item', 'amount');
					subTotal += getFloatVal(currAmt);
					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', ITEM_SUBTOTAL);
					rec.setCurrentLineItemValue('item', 'amount', subTotal);
					rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
					rec.commitLineItem('item');
				}
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
              	//Added by Karthika for issue SC-1562
				var item_desc = arrBPOLineInfo[blanketPOLine].itemdesc ;
				var itemname = nlapiLookupField('item', item, 'itemid');
				//dLog('ts740_createCompositePrincipalOrder', 'in grossmargin mmm..' + item_desc);
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);
				rec.setCurrentLineItemValue('item', 'custcolmemo', itemname);
				rec.setCurrentLineItemValue('item', 'description', item_desc);
              	//Added by karthika to set the blanket po line and banket po line - Second line item
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', '');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', '');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', '');
				//ends here karthika 
				if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

					if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				}

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

				if (!isEmpty(compositeItem)){
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
					var componame = nlapiLookupField('item',compositeItem,'displayname');
					dLog('ts740_createCompositePrincipalOrder', 'Composite Name is ' + componame);
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
				}
				
				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // //3rd feb 2017 ref Dennis email 810 import format
				rec.commitLineItem('item');

				dLog('ts740_createCompositePrincipalOrder', 'Set Gross Margin line..');
			}

			// subtotal
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'item', ITEM_SUBTOTAL);
			rec.setCurrentLineItemValue('item', 'amount', subTotal);
			rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
			rec.commitLineItem('item');
		}

		// >>> START : Other charge line
		var rsASNLine = getOtherCharges(blanketPOName.split('-')[1], custPONo);
		var arrASNLineId = [];
		for (var i = 0; rsASNLine != null && i < rsASNLine.length; i++) {

			arrASNLineId.push(rsASNLinep[i].getId());
			// asn line item
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemText('item', 'custcol_ts_ap_ar_asn_line', rsASNLine[i].getValue('name'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', rsASNLine[i].getValue('custrecord_ts_rspo_po_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', rsASNLine[i].getValue('custrecord_ts_asn_bpol_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', rsASNLine[i].getValue('custrecord_ts_asn_bpo_line_no'));
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			// rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm',
			// arrRSPOMapInfo[releaseShipmentPO]);
			// rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier',
			// arrBPOInfo[blanketPO].supplier);
			// rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty',
			// arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', rsASNLine[i].getValue('custrecord_ts_asn_item'));
			rec.setCurrentLineItemValue('item', 'quantity', rsASNLine[i].getValue('custrecord_ts_asn_qty'));
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', rsASNLine[i].getValue('custrecord_ts_asn_item_rate'));
			rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
			rec.commitLineItem('item');

			// asnAmt = rec.getCurrentLineItemValue('item', 'amount');
		}

		// >>> END : Other charge ine

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts740_createCompositePrincipalOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);
		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}

function ts740_createCompositeTradingOrder(objRS, asnId) {
	try {
		dLog('ts740_createCompositeTradingOrder', '>>>>>>>>>>>>>>>');

		var rec = nlapiCreateRecord('salesorder', {
			recordmode : 'dynamic',
			customform : FORM_TS_SALES_ORDER,
			entity : objRS[0].getValue('custrecord_asn_bill_to_customer')
		});

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));
		rec.setFieldValue('location', LOC_THREESIXTY);

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Item Ids
		var arrItemId = [];
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
            var oh_number = nlapiLookupField('purchaseorder', releaseShipmentPO, 'custbody_ts_rspo_customer_release_no'); // 14-Dec-2016 - HY for issue# 309
			var subTotal = 0;
			var asnAmt = 0;

			dLog('ts740_createCompositeTradingOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('ts740_createCompositeTradingOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
            rec.setCurrentLineItemValue('item', 'custcol_ts_oh_number', oh_number); // 14-Dec-2016 - HY for issue# 309
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', itemId);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);

			if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

				dLog('ts740_createCompositeTradingOrder', 'Blanket Info = ' + JSON.stringify(arrBPOLineInfo[blanketPOLine]));

				rec.setCurrentLineItemValue('item', 'rate', setValue(arrBPOLineInfo[blanketPOLine].linerate));

				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepayto))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', arrBPOLineInfo[blanketPOLine].adlchrgepayto);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepercent))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', arrBPOLineInfo[blanketPOLine].adlchrgepercent);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgeunit))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', arrBPOLineInfo[blanketPOLine].adlchrgeunit);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].htscode))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', arrBPOLineInfo[blanketPOLine].htscode);
			}

			if (arrItemLotMap[itemId] == 'T') {

				dLog('ts740_createCompositeTradingOrder', 'setting sublist @ line ' + i + ' | Serial No. : ' + custPONo + ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('ts740_createCompositeTradingOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');
			if (!isEmpty(compositeItem)){
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				var componame = nlapiLookupField('item',compositeItem,'displayname');
				dLog('ts740_createCompositeTradingOrder', 'Composite Name is ' + componame);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
			}
			
			rec.commitLineItem('item');

			dLog('ts740_createCompositeTradingOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {

				// additional charge
				var addlChargeRate = arrBPOMap[blanketPOLine].adlchrgepercent;
				var addlChargeAmt = arrBPOMap[blanketPOLine].adlchrgeunit;
				var chargeItem = arrBPOMap[blanketPOLine].charge_item;

				dLog('ts740_createCompositeTradingOrder', 'addlChargeRate = ' + addlChargeRate);
				dLog('ts740_createCompositeTradingOrder', 'addlChargeAmt = ' + addlChargeAmt);
				dLog('ts740_createCompositeTradingOrder', 'chargeItem = ' + chargeItem);

				if (!isEmpty(chargeItem)) {

					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', chargeItem);

					if (!isEmpty(addlChargeRate)) {
						var chargeAmt = getFloatVal(addlChargeRate) * getIntVal(itemQty);
						dLog('createTradingorder', 'setting charge rate |  chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'rate', addlChargeRate);
						rec.setCurrentLineItemValue('item', 'amount', chargeAmt);
					}

					if (!isEmpty(addlChargeAmt)) {

						var chargeAmt = getFloatVal(addlChargeAmt) * getIntVal(itemQty);
						dLog('ts740_createCompositeTradingOrder', 'setting charge amount | chargeAmt = ' + chargeAmt);
						rec.setCurrentLineItemValue('item', 'description', 'Qty : ' + itemQty + ' | Rate : ' + addlChargeAmt);
						rec.setCurrentLineItemValue('item', 'price', -1);
						rec.setCurrentLineItemValue('item', 'rate', chargeAmt);
					}

					if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepayto))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_pay_to', arrBPOLineInfo[blanketPOLine].adlchrgepayto);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgepercent))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_percent', arrBPOLineInfo[blanketPOLine].adlchrgepercent);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].adlchrgeunit))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_add_charge_unit', arrBPOLineInfo[blanketPOLine].adlchrgeunit);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
						if (!isEmpty(arrBPOLineInfo[blanketPOLine].htscode))
							rec.setCurrentLineItemValue('item', 'custcol_ts_inv_hts_code', arrBPOLineInfo[blanketPOLine].htscode);
					}

					if (!isEmpty(compositeItem)){
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
						var componame = nlapiLookupField('item',compositeItem,'displayname');
						dLog('ts740_createCompositeTradingOrder', 'Composite Name is ' + componame);
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_name', componame);
					}

					rec.commitLineItem('item');

					dLog('ts740_createCompositeTradingOrder', 'Set Addl Charge line..');

					// subtotal
					var currAmt = rec.getCurrentLineItemValue('item', 'amount');
					subTotal += getFloatVal(currAmt);
					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', ITEM_SUBTOTAL);
					rec.setCurrentLineItemValue('item', 'amount', subTotal);
					rec.commitLineItem('item');
				}
			}
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('ts740_createCompositeTradingOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);
		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}