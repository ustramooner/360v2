/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       03 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function HermanTest() {
	
    var asnId = '33546';
    var objRS = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', asnId));
    
	    try {

			dLog('ts760_createCompositePrincipalOrder', '>>>>>>>>>>>>>>>');

			var rec = initSORec(objRS);

			rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
			rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
			rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

			// Blanket PO Ids
			var arrBPOId = [];
			// Blanket PO Line Ids
			var arrBPOLineId = [];
			// Release Shipment PO Ids
			var arrRSPOId = [];
			// Customer PO Number, which is also lot number
			var custPONo = '';
			// Item Ids
			var arrItemId = [];
			var arrCompositeItem = [];
			// final asn item added by Herman
			var final_asn_item = [];
			// end add by Herman

			var arrItemTypeMap = getASNItemType(objRS);

			for (var ix = 0; ix < objRS.length; ix++) {

				var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				custPONo = objRS[ix].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var compositeItem = objRS[ix].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var itemQuantity = objRS[ix].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
				// added by Herman

				// Changed by Herman 19-Jul-2016
				if (!isEmpty(blanketPOId)){
					arrBPOId.push(blanketPOId);
					var blanketPOName = nlapiLookupField('customrecord_ts_blanket_po', blanketPOId, 'name');
				}


				if (!isEmpty(blanketPOLineId))
					arrBPOLineId.push(blanketPOLineId);

				if (!isEmpty(releaseShipmentPO))
					arrRSPOId.push(releaseShipmentPO);

				if (!isEmpty(item))
					arrItemId.push(item);

				if (!isEmpty(compositeItem)) {

					// ex. InvtPart, OthCharge
					if (arrItemTypeMap[item] == 'OthCharge')
						continue;

					// added by Herman
					arrCompositeItem.push(compositeItem);
					
					// Changed by Herman 19-Jul-2016
					final_asn_item.push({
						myfinal_item : item,
						mycomposite_item : compositeItem,
						myitemQty : itemQuantity,
						myfinalpoName : blanketPOName.replace(/^PO-/, ''),
						mylotnumber : custPONo
					});
					// End add by Herman
				}
			}

			var arrBPOMap = getAddlCharges(arrBPOLineId);
			var arrBPOInfo = getBlanketPOInfo(arrBPOId);
			var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
			var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
			var arrItemLotMap = checkItemLot(arrItemId);
			var arrSubComponents = getComponentsInfo(arrCompositeItem);
			// var arrOtherCharges = getOtherCharges();



			var itemQty = '';
			var blanketPOName = '';

			// >>>> START : Setting ASN lines
			for (var i = 0; i < objRS.length; i++) {

				var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				blanketPOName = objRS[i].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
				itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				var subTotal = 0;
				var asnAmt = 0;

				// asnCompositeItem = compositeItem;
				// finalItem = itemId;

				dLog('ts760_createCompositePrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);
				dLog('ts760_createCompositePrincipalOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

				// asn line item
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
				rec.setCurrentLineItemValue('item', 'item', itemId);
				rec.setCurrentLineItemValue('item', 'quantity', itemQty);
				rec.setCurrentLineItemValue('item', 'price', -1);
				rec.setCurrentLineItemValue('item', 'rate', itemRate);

				if (!isEmpty(arrContainerMap[asnLine]))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

				if (arrItemLotMap[itemId] == 'T') {

					dLog('ts760_createCompositePrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo
							+ ' | Qty : ' + itemQty);

					var serialLotNum = custPONo + '(' + itemQty + ')';
					dLog('ts760_createCompositePrincipalOrder', 'serialLotNum = ' + serialLotNum);

					rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
					rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
				}

				if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
					setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

				asnAmt = rec.getCurrentLineItemValue('item', 'amount');

				rec.commitLineItem('item');

				dLog('ts760_createCompositePrincipalOrder', 'Set asn line item..');

				subTotal += getFloatVal(asnAmt);

				if (!isEmpty(arrBPOMap[blanketPOLine])) {
					subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, compositeItem);
				}

				// gross margin
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
					setGrossMargin(rec, arrBPOLineInfo[blanketPOLine].grossmargin, subTotal);
					setSubTotal(rec, subTotal);
				}
			}
			// >>>> END : Setting ASN lines
			dLog('ts760_createCompositePrincipalOrder', 'Added ASN Line....');

			// Larger Loop added by Herman
			for (yx in final_asn_item) {

				var finalItem = final_asn_item[yx].myfinal_item;
				var asnCompositeItem = final_asn_item[yx].mycomposite_item;
				var finalItemQty = final_asn_item[yx].myitemQty;
				var finalpoName = final_asn_item[yx].myfinalpoName;
				var lotnumber = final_asn_item[yx].mylotnumber; // added 22-July-2016
				// added by Herman

				dAudit('ts760_createCompositePrincipalOrder', 'asnCompositeItem = ' + asnCompositeItem);

				// >>>START: Adding local items
				var objTemp = arrSubComponents[asnCompositeItem];
				var arrLocalBPOLineId = [];
				var arrLocalBPOId = [];
				var arrLocalItemId = [];

				for (kx in objTemp) {

					var itemId = objTemp[kx].subcompid;

					if (itemId == finalItem)
						continue;

					var filters = [];
					filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
					filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
					// added by Herman 19-Jul-2016
					filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));

					var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

					if (rs == null)
						break;

					var itemId = rs[0].getValue('item');
					var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
					var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');

					if (!isEmpty(blanketPOLine))
						arrLocalBPOLineId.push(blanketPOLine);

					if (!isEmpty(blanketPO))
						arrLocalBPOId.push(blanketPO);

					if (!isEmpty(itemId))
						arrLocalItemId.push(itemId);

				}

				var arrLocalBPOMap = getAddlCharges(arrBPOLineId);
				var arrLocalBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
				var arrLocalItemLotMap = checkItemLot(arrItemId);

				dAudit('ts760_createCompositePrincipalOrder', 'objTemp = ' + JSON.stringify(objTemp));

				for (kx in objTemp) {

					var itemId = objTemp[kx].subcompid;

					dLog('ts760_createCompositePrincipalOrder', 'finalItem = ' + finalItem);
					dLog('ts760_createCompositePrincipalOrder', 'finalItemQty = ' + finalItemQty);
					// added by Herman
					dLog('ts760_createCompositePrincipalOrder', 'itemId = ' + itemId);
					dLog('ts760_createCompositePrincipalOrder', 'Sub comp Id  = ' + itemId);
					dLog('ts760_createCompositePrincipalOrder', 'Cust PO No.  = ' + itemId);

					if (itemId == finalItem)
						continue;

					var filters = [];
					filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
					filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', lotnumber));
					// added by Herman 19-Jul-2016
					filters.push(new nlobjSearchFilter('custrecord_ts_bpo_delivery_to_po', 'custcol_ts_ap_bpo_no', 'is', finalpoName));

					var rs = nlapiSearchRecord('transaction', 'customsearch_asn_local_items', filters);

					if (rs == null) {

						dAudit('ts760_createCompositePrincipalOrder', 'ASN Local items search results = ' + rs + ' is empty/null continue checking next sub component');
						continue;
					}

					var itemId = rs[0].getValue('item');
					var blanketPOLine = rs[0].getValue('custcol_ts_ap_ar_bpol');
					var blanketPO = rs[0].getValue('custcol_ts_ap_bpo_no');
					var addChargePayTo = rs[0].getValue('custrecord_ts_bpol_add_charge_pay_to', 'CUSTCOL_TS_AP_AR_BPOL');
					var addlChargeRate = rs[0].getValue('custrecord_ts_bpol_add_charge_percent', 'CUSTCOL_TS_AP_AR_BPOL');
					var addlChargeAmt = rs[0].getValue('custrecord_ts_add_charge_per_unit', 'CUSTCOL_TS_AP_AR_BPOL');
					var sellingPrice = rs[0].getValue('custrecord_ts_bpol_selling_price', 'CUSTCOL_TS_AP_AR_BPOL');
					var rate = rs[0].getValue('custrecord_ts_bpol_rate', 'CUSTCOL_TS_AP_AR_BPOL');
					var grossMargin = rs[0].getValue('custrecord_ts_bpol_gross_margin_rate', 'CUSTCOL_TS_AP_AR_BPOL');

					var subTotal = 0;
					var asnAmt = 0;

					dLog('ts760_createCompositePrincipalOrder', 'Local Blanket PO line Id = ' + blanketPOLine);
					dLog('ts760_createCompositePrincipalOrder', 'Local Blaket PO Line charge Info = ' + arrLocalBPOMap[blanketPOLine]);

					// asn line item
					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
					rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
					rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', lotnumber);
					rec.setCurrentLineItemValue('item', 'item', itemId);
					rec.setCurrentLineItemValue('item', 'quantity', finalItemQty);
					rec.setCurrentLineItemValue('item', 'price', -1);
					rec.setCurrentLineItemValue('item', 'rate', rate);

					var serialLotNum = lotnumber + '(' + finalItemQty + ')';
					dLog('ts760_createCompositePrincipalOrder', 'Local serialLotNum = ' + serialLotNum);

					rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
					rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);

					asnAmt = rec.getCurrentLineItemValue('item', 'amount');

					rec.commitLineItem('item');

					dLog('ts760_createCompositePrincipalOrder', 'Set Local line item..');

					subTotal += getFloatVal(asnAmt);

					if (!isEmpty(arrLocalBPOMap[blanketPOLine])) {
						subTotal = setAddlCharge(rec, arrLocalBPOMap[blanketPOLine], itemQty, arrLocalBPOLineInfo[blanketPOLine], subTotal, '');
					}

					// gross margin
					if (!isEmpty(grossMargin)) {

						subTotal = setGrossMargin(rec, grossMargin, subTotal);
						setSubTotal(rec, subTotal);
					}
				}
			}
			// >>>END: Adding local items
			// END LARGER LOOP BY HERMAN
			dLog('ts760_createCompositePrincipalOrder', 'Added LOCAL Line....');

			// added by Herman
			var final_blanketpo_name = [];
			var objRS2 = nlapiSearchRecord('customrecord_ts_asn', 'customsearch_asn_bposearch', new nlobjSearchFilter('internalid', null, 'anyof', asnId));
			var uniquebpo = 0;
			for (var bpocount = 0; bpocount < objRS2.length; bpocount++) {
				var currentbpo = objRS2[bpocount].getText('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
				if (bpocount == '0') {
					final_blanketpo_name[uniquebpo] = currentbpo;
				}

				if (final_blanketpo_name[uniquebpo] == currentbpo) {
					continue;
				} else {
					uniquebpo++;
					final_blanketpo_name[uniquebpo] = currentbpo;
				}

			}

			// START LARGER LOOP BY HERMAN
			for ( var mm in final_blanketpo_name) {
				// for (var mm = 0; mm < final_blanketpo_name.length; mm++) {

				blanketPOName = final_blanketpo_name[mm];
				// >>> START : Other charge line
				dLog('ts760_createCompositePrincipalOrder', 'Blanket PO = ' + blanketPOName);
				var rsASNLine = getOtherCharges(blanketPOName.split('-')[1], custPONo);
				var arrASNLineId = [];
				for (var idx = 0; rsASNLine != null && idx < rsASNLine.length; idx++) {

					var asnLineId = rsASNLine[idx].getId();

					dLog('ts760_createCompositePrincipalOrder', 'ASN Line Id = ' + asnLineId);

					arrASNLineId.push(asnLineId);

					// other charge item line
					rec.selectNewLineItem('item');
					// INVALID_KEY_OR_REF<br>Invalid custcol_ts_ap_ar_asn_line
					// reference key 13382 for custbody_ts_rspo_related_asn 11239.
					// rec.setCurrentLineItemValue('item',
					// 'custcol_ts_ap_ar_asn_line', asnLineId);
					rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', rsASNLine[idx].getValue('custrecord_ts_rspo_po_no'));
					rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', rsASNLine[idx].getValue('custrecord_ts_asn_bpol_no'));
					rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', rsASNLine[idx].getValue('custrecord_ts_asn_bpo_line_no'));
					rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
					rec.setCurrentLineItemValue('item', 'item', rsASNLine[idx].getValue('custrecord_ts_asn_item'));
					rec.setCurrentLineItemValue('item', 'quantity', rsASNLine[idx].getValue('custrecord_ts_asn_qty'));
					rec.setCurrentLineItemValue('item', 'price', -1);
					rec.setCurrentLineItemValue('item', 'rate', rsASNLine[idx].getValue('custrecord_ts_asn_item_rate'));

					if (!isEmpty(arrContainerMap[asnLineId]))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLineId].toString());

					rec.commitLineItem('item');
					// asnAmt = rec.getCurrentLineItemValue('item', 'amount');
				}

				dLog('ts760_createCompositePrincipalOrder', 'Set Other charge line..');
				// >>> END : Other charge ine
			}
			dLog('ts760_createCompositePrincipalOrder', 'Added OTHER CHARGE Line....');

			var id = nlapiSubmitRecord(rec, true, true);
			dAudit('ts760_createCompositePrincipalOrder', 'Created Sales Order | id = ' + id);

			// After Sales Order is successfully created, go back to each of the ASN
			// lines, referenced and tick the checkbox "Other Charge Processed".
			// This ensure that future
			// ASN processing will not process these ASN lines again.

			dLog('ts760_createCompositePrincipalOrder', 'Tick ASN Lines "Other Charge Processed"');

			for (aln in arrASNLineId) {

				dAudit('ts760_createCompositePrincipalOrder', 'Updating ASN line | id ' + arrASNLineId[aln]);
				nlapiSubmitField('customrecord_ts_asn_item_details', arrASNLineId[aln], 'custrecord_asn_line_processed', 'T');
			}

			return id;

	    }
	    catch (e) {
	        var stErrMsg = '';
	        if (e.getDetails !== undefined) {
	            stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
	        }
	        else {
	            stErrMsg = 'SO Creation Error: ' + e.toString();
	        }

	        dLog('SO Creation Error', stErrMsg);

	        return null;
	    }
	
	 

}
