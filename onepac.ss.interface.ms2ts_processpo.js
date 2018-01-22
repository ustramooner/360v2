/**
 * Project: ${project}
 * Filename: ${filename}
 * Description:
 *
 * Version      Date         Author               Email                        Remarks
 * 1.00         19 Aug 2017      Clemen R. Canaria    clemen@canariawerx.com
 *
 */
var COMPANY_PREFS = getPrefs('companypreferences');
var USER_PREFS = getPrefs('userpreferences');
var SUB_CONFIG;
//var LOG_ID = null;

//Global Variables
var interfaceWarning = ''; // Stores all details warnings related to the interface.
var interfaceError = ''; // Stores all details errors related to the interface.
var logRec = null;

var newReleases = [];
var revisedReleases = [];
var cancelledReleases = [];

function main() {

    var interfaceLogs = nlapiSearchRecord('customrecord_ts2_interface_log',
        null,
        [
            new nlobjSearchFilter('custrecord_ts2_interface_log_tobeprocess', null, 'is', 'T'),
            new nlobjSearchFilter('custrecord_ts2_interface_pending', null, 'is', 'F')
        ],
        [
            new nlobjSearchColumn('custrecord_ts2_interface_mspo'),
            new nlobjSearchColumn('custrecord_ts2_interface_blanketpo')
        ]
    ) || [];

    var context = nlapiGetContext();
    nlapiLogExecution('AUDIT', 'Interface Found', interfaceLogs.length);
    nlapiLogExecution('DEBUG', 'Start', '<-----');
    var interFaces = [];
    for (var i = 0; i < interfaceLogs.length; i++) {
        processInterfaceLog(interfaceLogs[i].id, context);

        nlapiSubmitField('customrecord_ts2_interface_log', interfaceLogs[i].id, 'custrecord_ts2_interface_log_tobeprocess', 'F');
        if (interFaces.indexOf(interfaceLogs[i].id) < 0) {
            interFaces.push(interfaceLogs[i].id);
        }
        checkGovernance();
    }

    nlapiLogExecution('AUDIT', 'New Releases', JSON.stringify(newReleases));
    nlapiLogExecution('AUDIT', 'Revised Releases', JSON.stringify(revisedReleases));
    nlapiLogExecution('AUDIT', 'Cancelled Releases', JSON.stringify(cancelledReleases));

    var reports = Onepac_InterfaceLog_Report.Reports();
    var su = reports.GetSummaryReport(newReleases, revisedReleases, cancelledReleases);
    nlapiLogExecution('AUDIT', 'Summary', su);

    nlapiScheduleScript('customscript_ss_interface_log_summary', 'customdeploy_ss_interface_log_summary', {
        custscript_interfaces_json: JSON.stringify(interFaces),
        custscript_interfaces_releases: su
    });

    //var fileReports = reports.GetDeltaReport(interFaces);

    //nlapiLogExecution('AUDIT', 'Delta Reports', fileReports);

    nlapiLogExecution('DEBUG', 'END', '----->');

}

function getMSPOJSON(msPO) {
    return msPO.getValue('custrecord_ts2_interface_mspo_json');
}

function getLatestMSPO(msPOId) {
    var filters = [];
    filters.push(new nlobjSearchFilter('custrecord_ts2_interface_mspo', null, 'is', msPOId));

    var columns = [];
    columns.push(new nlobjSearchColumn('created'));
    columns.push(new nlobjSearchColumn('custrecord_ts2_interface_mspo_json'));
    columns.push(columns[0].setSort(true));

    var interfaceLogs = nlapiSearchRecord('customrecord_ts2_interface_log', null, filters, columns);

    if (interfaceLogs.length > 0) {
        if (interfaceLogs.length === 1) {
            return interfaceLogs[0];
        }
        return interfaceLogs[1];
    }
    return null;
}

function getReleaseLineTotalAmount(lineItems) {
    var sum = 0;
    lineItems.forEach(function (line) {
        sum += parseInt(line.amount);
        return true;
    });
    return sum;
}

function get850(items, orderNumber) {
    var result = null;
    items.forEach(function (item) {
        if (item.custcol_release_order_number === orderNumber) {
            result = item.custcol_send850;
            return true;
        }
    });
    return result;
}

function get860(items, orderNumber) {
    var result = null;
    items.forEach(function (item) {
        if (item.custcol_release_order_number === orderNumber) {
            result = item.custcolsend860;
            return true;
        }
    });
    return result;
}

function removeBKFromLine(lines) {
    var index = -1;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].custcol_release_order_number.toLowerCase().indexOf('bk') > -1) {
            index = i;
            break;
        }
    }

    lines.splice(index, 1);
    return lines;
}

function getBulkPOCustomer(lines) {
    var bkLine = null;
    lines.forEach(function (line) {

        if (line.customer.name.toLowerCase() === 'bulk po' || line.custcol_release_order_number.toLowerCase().indexOf('bk') > -1) {
            bkLine = line;
            return true;
        }
        return true;
    });
    return bkLine;
}

function isValid(val) {
    return val !== null && val !== undefined && val !== '';
}

function getDefaultOCFromCustomer(customerId) {
    if (isValid(customerId)) {
        var customer = nlapiLoadRecord('customer', customerId);
        return customer.getFieldValue('custentity_ts2_customer_default_oc');
    }
    return '';
}

function getDefaultPS(customerId) {
    if (isValid(customerId)) {
        return nlapiLookupField('customer', customerId, 'custentity_ts2_customer_default_ps');
    }
    return '';
}

function getReleaseHeaderTransportMode(mode) {
    if (mode === '6') {
        return '7';
    }
    else if (mode === '7') {
        return '6';
    }
    return '8';
}


/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment.
 * @appliedtorecord customrecord_ts2_interface_log
 *
 * @param {String} type Operation types: create
 * @returns {Void}
 */
function processInterfaceLog(logId, context) {

    nlapiLogExecution('DEBUG', 'Current User', nlapiGetUser());

    var tssMSInterfaceBatchLogRecId = 0;

    interfaceWarning = '<B>START OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();
    interfaceError = '<B>START OF LOG</B><BR><B>Time:</B> ' + getCompanyCurrentDateTime();

    var bpolPriceArr = [];
    var tsBPO = null;
    var msPO;
    var bkLine;

    logRec = nlapiLoadRecord('customrecord_ts2_interface_log', logId);
    var batch_code = logRec.getFieldValue('custrecord_ts2_interface_batch_code');
    var msPoId = logRec.getFieldValue('custrecord_ts2_interface_mspo');
    var tsBpoId = logRec.getFieldValue('custrecord_ts2_interface_blanketpo');

    msPO = nlapiLoadRecord('purchaseorder', logRec.getFieldValue('custrecord_ts2_interface_mspo'));

    if (logRec.getFieldValue('custrecord_ts2_interface_blanketpo')) {
        tsBPO = nlapiLoadRecord('customrecord_ts_blanket_po', logRec.getFieldValue('custrecord_ts2_interface_blanketpo'));
    }


    try {

        // Load Subsidiary Settings
        SUB_CONFIG = getSubsidiarySettings(1); // ThreeSixty Sourcing Limited


        //PG changed 20171221
        if (logRec.getFieldValue('custrecord_ts2_interface_pending') === 'T') {
            //do nothing
            return;
        }

        if (logRec.getFieldValue('custrecord_ts2_interface_log_tobeprocess') === 'T') {

            if (tsBPO && 1 === 2) {

                var checkTotalShippedQty = validateTotalShippedQty(msPO, tsBPO);

                if (!checkTotalShippedQty) {
                    nlapiLogExecution('ERROR', 'Shipped Quantity Validation', 'Release Line Total Shipped Quantity > New Quantity');
                    return;
                }

                var status = getStatus(msPO, tsBPO);
                nlapiLogExecution('DEBUG', 'Status', status);
                var checkStatus = validateStatus(status);
                if (!checkStatus) {
                    nlapiLogExecution('ERROR', 'Purchase Order Status', msPO.getFieldValue('tranid') + ' is ' + status);
                    return;
                }
                nlapiLogExecution('DEBUG', 'Status Check', checkStatus);

            } else {
                nlapiLogExecution('DEBUG', 'TS BPO', 'No TS BPO Found: ' + tsBpoId);
            }

            var releaseLinesToBeUpdated = [];
            var expenseLinesToBeUpdated = [];

            var poRec = msPO; //nlapiLoadRecord('purchaseorder', msPoId);
            var poRawJsonStr = JSON.stringify(poRec);

            logRec.setFieldValue('custrecord_ts2_interface_mspo_json', poRawJsonStr);

            var poRawJsonObj = JSON.parse(poRawJsonStr);


            // EXPRENSE LINES
            var expLines = null;

            if (poRawJsonObj.hasOwnProperty('expense')) {
                expLines = poRawJsonObj.expense;
            }
            //            nlapiLogExecution('DEBUG', 'expLines', JSON.stringify(expLines));

            bkLine = getBulkPOCustomer(poRawJsonObj.item); //[0];

            nlapiLogExecution('DEBUG', 'bkLine', JSON.stringify(bkLine));

            if (bkLine == null) {
                nlapiLogExecution('ERROR', 'No Customer: Bulk PO found!', JSON.stringify(bkLine));
                return;
            }

            var htsCodeObj = {};

            if (bkLine && bkLine.hasOwnProperty('custcol_hts')) {
                htsCodeObj = getHtsCode(bkLine.custcol_hts);
            }

            var bkLineQty = bkLine ? parseInt(bkLine.quantity) : 0;
            //            nlapiLogExecution('DEBUG', 'bkLineQty', bkLineQty);

            //releaseLinesToBeUpdated.push(1);

            var rlLines = poRawJsonObj.item;
            rlLines = removeBKFromLine(rlLines);

            /*** START COMMONS ***/
            var commons = {};
            //nlapiLogExecution('DEBUG', 'rlLines', 1);

            if (poRawJsonObj.hasOwnProperty('custbody_maker')) {

                commons.maker = getTsMakerByNo(poRawJsonObj.custbodymaker_no);

            }

            if (poRawJsonObj.hasOwnProperty('custbody_factoryname')) {
                commons.factory = getTsFactoryByNo(poRawJsonObj.custbody_factory_number);
            }
            //nlapiLogExecution('DEBUG', 'rlLines', 3);

            // Check TS Vendor & Factory Relationship
            hasTsVendorFactoryRelationship(commons.maker.id, commons.factory.id);
            //nlapiLogExecution('DEBUG', 'rlLines', 4);

            if (bkLine.custcol_release_order_number.match(/^BK/)) {
                releaseLinesToBeUpdated.push(bkLine.custcol_release_order_number);
                commons.itemobj = getItem(bkLine.item);
                commons.prefix = getProjectShipToPrefix(commons.itemobj.id, poRawJsonObj.entity.internalid);
                commons.project = getProject(commons.prefix, poRawJsonObj);
            } else {
                nlapiLogExecution('ERROR', 'ERROR', 'First line is not blanket PO.');
                interfaceError += '<BR><B style="COLOR: red">ERROR:</B> First line is not blanket PO.';
                logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
            }
            nlapiLogExecution('DEBUG', 'commons', JSON.stringify(commons));
            /*** END COMMONS ***/

            var priceQtyMap = {};

            for (var i = 0; i < (poRawJsonObj.item).length; i++) {
                var itemLineObj = poRawJsonObj.item[i];

                var itemLineRate = itemLineObj.rate;
                var itemLineQty = parseInt(itemLineObj.quantity);
                //nlapiLogExecution('DEBUG', 'itemLineQty', itemLineQty);

                if (!priceQtyMap.hasOwnProperty(itemLineRate)) {
                    priceQtyMap[itemLineRate] = itemLineQty;
                } else {
                    priceQtyMap[itemLineRate] += itemLineQty;
                }
            }

            if (priceQtyMap.hasOwnProperty(bkLine.rate)) {
                priceQtyMap[bkLine.rate] += bkLineQty;
            } else {
                priceQtyMap[bkLine.rate] = bkLineQty;
            }

            nlapiLogExecution('DEBUG', 'priceQtyMap', JSON.stringify(priceQtyMap));

            var poJsonObj = filterLines(poRawJsonObj);


            /*** START CREATE ***/
            var now = new Date();
            var bpolPriceMap = {};
            var customerDefaultOC = null;

            if (!tsBpoId) {

                nlapiLogExecution('DEBUG', 'TS BPO not found', 'Creating New Blanket PO');


                var ts2BlanketPoId = null;
                //var ts2BlanketPoLineId = null;

                //var compositeItemObj = createCompositeNo(bkLine, bkLine.custcol_master_ctn_markings_item_num, commons.project.parent);
                var compositeItemObj = null;
                /*** Start Create BPO ***/
                var ts2BlanketPoRec = nlapiCreateRecord('customrecord_ts_blanket_po');
                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                if (isValid(poJsonObj.incoterm)) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_incoterm', poJsonObj.incoterm);
                }
                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_dd', formatDate(now));
                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_ob_no', poJsonObj.tranid);
                //              ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_customer_po_no', poJsonObj.tranid);
                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_customer_po_dd', poJsonObj.trandate);
                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_po_status', 11); // Pre-approved
                ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_order_owner', 8880); // nlapiGetUser());
                //ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_order_owner', context.getUser());// nlapiGetUser());
                if (isValid(compositeItemObj) && compositeItemObj.id !== null) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_composite_no', compositeItemObj.id);
                }
                ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_exchange_rate', 1);
                if (poJsonObj.hasOwnProperty('id')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_ob_no_link', poJsonObj.id);
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_ms_master_ob_no', poJsonObj.tranid);
                }

                if (poJsonObj.hasOwnProperty('currency')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_currency', poJsonObj.currency.internalid);
                }

                ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_pj', commons.project.id);

                if (commons.maker != null) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_supplier', commons.maker.id);
                }

                if (commons.factory != null) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_fty', commons.factory.id);
                }

                if (poJsonObj.hasOwnProperty('terms')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_pyt_terms', poJsonObj.terms.internalid);
                }

                if (poJsonObj.hasOwnProperty('custbody_product_manager')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_customer_order_ctc', poJsonObj.custbody_product_manager.name);
                }

                if (poJsonObj.hasOwnProperty('custbody_tooling_charge_ref_number')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_ms_tooling_charge_no', poJsonObj.custbody_tooling_charge_ref_number);
                }

                if (poJsonObj.hasOwnProperty('custbody_free_factory_sample_qty')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts_bpo_ms_free_sample_qty', poJsonObj.custbody_free_factory_sample_qty);
                }

                if (poJsonObj.hasOwnProperty('custbodychange_remarks')) {
                    ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_ms_special_notes', poJsonObj.custbodychange_remarks);
                }


                ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_json_bkline', JSON.stringify(bkLine));
                ts2BlanketPoRec.setFieldValue('custrecord_ts2_bpo_json_mspo', JSON.stringify(poJsonObj));

                try {

                    ts2BlanketPoId = nlapiSubmitRecord(ts2BlanketPoRec, true, true);

                    var customer = nlapiLookupField('customrecord_ts_blanket_po', ts2BlanketPoId, 'custrecord_ts_bpo_customer');

                    customerDefaultOC = nlapiGetUser();//getDefaultOCFromCustomer(customer);

                    if (isValid(customerDefaultOC)) {
                        nlapiSubmitField('customrecord_ts_blanket_po', ts2BlanketPoId, 'custrecord_ts2_bpo_order_owner', customerDefaultOC);
                    }

                    var updateBlanketPOFieldsId = [];
                    var updateBlanketPOFieldsValue = [];


                    nlapiLogExecution('DEBUG', 'Blanket PO Created', ts2BlanketPoId);

                    if (isValid(customerDefaultOC)) {
                        //nlapiSubmitField('customrecord_ts_blanket_po', ts2BlanketPoId, 'custrecord_ts2_bpo_order_owner', customerDefaultOC);
                        updateBlanketPOFieldsId.push('custrecord_ts2_bpo_order_owner');
                        updateBlanketPOFieldsValue.push(customerDefaultOC);
                    }

                    var customerDefaultPS = getDefaultPS(customer);
                    nlapiLogExecution('AUDIT','DEFAULT PS', customerDefaultPS);
                    if (customerDefaultPS) {
                        updateBlanketPOFieldsId.push('custrecord_ts2_bpo_ps_1');
                        updateBlanketPOFieldsValue.push(customerDefaultPS);
                    }

                    if (updateBlanketPOFieldsValue || updateBlanketPOFieldsId) {
                        nlapiSubmitField('customrecord_ts_blanket_po', ts2BlanketPoId, updateBlanketPOFieldsId, updateBlanketPOFieldsValue);
                    }

                    tssMSInterfaceBatchLogRecId = Onepac_InterfaceLog_Object.createInterfaceLog({
                        code: batch_code,
                        msPOId: poJsonObj.id,
                        tranId: poJsonObj.tranid,
                        tsBPOId: ts2BlanketPoId
                    });

                } catch (ex) {
                    nlapiLogExecution('ERROR', 'ERROR creating Blanklet PO', ex.toString());
                    //                    interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Blanklet PO failed! ' + ex.toString();
                    logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');

                    throw nlapiCreateError('ERROR_BPO_CREATION', "Problem creating TS2 Blanket Purchase Order record.");
                }

                /*** End Create BPO ***/

                if (ts2BlanketPoId) {

                    var releaseHeaderName = nlapiLookupField('customrecord_ts_blanket_po', ts2BlanketPoId, 'name');

                    nlapiLogExecution('DEBUG', 'releaseHeaderName1', releaseHeaderName);

                    //nlapiLogExecution('DEBUG', 'ts2BlanketPoId', ts2BlanketPoId);

                    logRec.setFieldValue('custrecord_ts2_interface_blanketpo', ts2BlanketPoId);

                    // TODO - LOG!!!!
                    var idx = 1;
                    /*** Start Create BPO Lines ***/
                    try {
                        var updatedPriceQtyMap = updatePriceQtyMap([], priceQtyMap, ts2BlanketPoId, releaseHeaderName, bkLine, poJsonObj, commons, htsCodeObj, idx, bpolPriceMap, bpolPriceArr);
                        bpolPriceMap = updatedPriceQtyMap.bpolPriceMap;
                        nlapiLogExecution('AUDIT', 'BPO Price Map', JSON.stringify(bpolPriceMap));
                        //bpolPriceArr = updatedPriceQtyMap.bpolPriceArr;
                    }
                    catch (ex) {
                        nlapiLogExecution('ERROR', 'ERROR creating Blanklet PO Line', ex.toString());
                        interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Blanklet PO Line failed! ' + ex.toString();
                        logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                    }


                    /*** End Create BPO Lines ***/

                    /*** Start Create Release Headers ***/
                    var INIT_IDX = 1;

                    for (var i = 0; i < rlLines.length; i++) {

                        nlapiLogExecution('DEBUG', 'RELEASE: remaining usage', context.getRemainingUsage());


                        var releaseLine = rlLines[i];

                        if (releaseLine.custcolsend860 || releaseLine.custcol_send850) {

                            var releaseHeaderName1 = releaseHeaderName.replace('PO-', 'RL-') + '-' + (i + 1);

                            var ts2ReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');

                            ts2ReleaseHeaderRec.setFieldValue('name', releaseHeaderName1);
                            if (isValid(customerDefaultOC)) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_order_owner', customerDefaultOC);
                            }
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_bpo_no', ts2BlanketPoId);
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', i + 1);
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pj', commons.project.id);

                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_special_note', poJsonObj.custbodychange_remarks);

                            if (commons.maker != null) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_supplier', commons.maker.id);
                            }
                            if (commons.factory != null) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_fty', commons.factory.id);
                            }
                            if (commons.terms != null) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pyt_terms', poJsonObj.terms.internalid);
                            }

                            if (releaseLine.custcol13 && releaseLine.custcol13 !== 'TBD') {
                                var customerETD = formatDate(new Date(toMomentDate(releaseLine.custcol13)));
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_supplier_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                            }

                            // Get Addresses
                            var addrObj = null;

                            if (commons.hasOwnProperty('prefix') && releaseLine.hasOwnProperty('custcol_finaldest') && releaseLine.hasOwnProperty('customer')) {
                                addrObj = getAddresses(commons.prefix, releaseLine.custcol_finaldest, releaseLine.customer);

                                if (addrObj.hasOwnProperty('shipto') && addrObj.shipto) {
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ship_to', addrObj.shipto);
                                }
                                if (addrObj.hasOwnProperty('consignee') && addrObj.consignee) {
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_consignee', addrObj.consignee);
                                }
                                if (addrObj.hasOwnProperty('notifparty1') && addrObj.notifparty1) {
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts_rlpo_notify_party', addrObj.notifparty1);
                                }
                                if (addrObj.hasOwnProperty('notifparty2') && addrObj.notifparty2) {
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_notify_party_2', addrObj.notifparty2);
                                }
                                if (addrObj.hasOwnProperty('notifparty3') && addrObj.notifparty3) {
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_notify_party_3', addrObj.notifparty3);
                                }
                            }

                            if (releaseLine.isclosed) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 6); // Closed / Cancelled
                                cancelledReleases.push(releaseLine.custcol_release_order_number);
                            } else {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 9); // Pre-approved
                                newReleases.push(releaseLine.custcol_release_order_number);
                            }

                            if (poJsonObj.hasOwnProperty('custbody_product_manager')) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_order_ctc', poJsonObj.custbody_product_manager.name);
                            }

                            if (releaseLine.hasOwnProperty('customer')) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_end_cus', releaseLine.customer.name);
                            }

                            if (releaseLine.hasOwnProperty('custcolb2bcontainer')) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_cont_type', releaseLine.custcolb2bcontainer.name);
                            }

                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_price_sticker', releaseLine.custcol_stickers);
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pro_bat', releaseLine.custcolprod_batch_letter);

                            if (releaseLine.hasOwnProperty('custcol_finaldest')) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_fin_des', releaseLine.custcol_finaldest.name);
                            }

                            if (releaseLine.custcol_release_order_number.match(/^ML/)) {
                                ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_title_transfer', "Material Release");
                            } else {
                                var originPort = poJsonObj.custbodyport_of_origin;

                                if (originPort) {
                                    originPort = originPort.toUpperCase();
                                }

                                if (OBJ_PORT_TITLE_MAP.hasOwnProperty(originPort)) {
                                    ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_title_transfer', OBJ_PORT_TITLE_MAP[originPort]);
                                }
                            }

                            if (releaseLine.hasOwnProperty('custcoldestport')) {
                                ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_port_of_discharge', releaseLine.custcoldestport.name);
                            }

                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_release_no', releaseLine.custcol_release_order_number);

                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_need_by_dd_def', 4);

                            try {

                                var ts2ReleaseHeaderId = nlapiSubmitRecord(ts2ReleaseHeaderRec, true, true);

                                if (ts2ReleaseHeaderId) {
                                    releaseLinesToBeUpdated.push(releaseLine.custcol_release_order_number);
                                }

                                tssMSInterfaceBatchLogRecId = Onepac_InterfaceLog_Object.createInterfaceLog({
                                    code: batch_code,
                                    msPOId: poJsonObj.id,
                                    tranId: poJsonObj.tranid,
                                    tsBPOId: ts2BlanketPoId,
                                    rhId: ts2ReleaseHeaderId,
                                    orderNumber: releaseLine.custcol_release_order_number
                                });

                                if (ts2ReleaseHeaderId) {

                                    try {

                                        var ts2ReleaseLineRec = Onepac_InterfaceLog.CreateReleaseLine();

                                        ts2ReleaseLineRec = Onepac_InterfaceLog_Process.CreateReleaseLine(ts2ReleaseLineRec, poJsonObj, releaseHeaderName1, ts2BlanketPoId, ts2ReleaseHeaderId, releaseLine, commons, addrObj, htsCodeObj, bpolPriceMap)
                                        nlapiLogExecution('DEBUG', 'Release Line Rec', JSON.stringify(ts2ReleaseLineRec));
                                        var ts2ReleaseLineId = Onepac_InterfaceLog.SubmitReleaseLine(ts2ReleaseLineRec.getRecord(), true, true);

                                        var releaseHeaderTransportMode = getReleaseHeaderTransportMode(releaseLine.custcolb2bcontainer.internalid);

                                        nlapiSubmitField('customrecord_ts2_rlpo', ts2ReleaseHeaderId, 'custrecord_ts2_rlpo_transportation_mode', releaseHeaderTransportMode);



                                    } catch (ex) {
                                        nlapiLogExecution('ERROR', 'ERROR creating Release Line 1', ex.toString());
                                    }

                                }

                            } catch (ex) {
                                nlapiLogExecution('ERROR', 'ERROR creating Release Header', ex.toString());
                            }

                            INIT_IDX++;

                        }
                    }
                    /*** End Create Release Headers ***/


                    /*** Start Create BPO Line and Release Header, Release Lines for MS Expense Lines ***/
                    if (isValid(expLines) && expLines.length > 0) {

                        var expLinesResults = searchExpenseItems(expLines);
                        if (expLinesResults == null) {
                            interfaceWarning += '<BR><B style="COLOR: red">ERROR:</B>Expense Account to Item mapping not found. Please create the appropriate mappings first.';
                            nlapiLogExecution('ERROR', 'ERROR', 'Expense Account to Item mapping not found. Please create the appropriate mappings first.');
                        }

                        for (var i = 0; isValid(expLines) && i < expLines.length; i++) {
                            nlapiLogExecution('DEBUG', 'EXPENSE: remaining usage', context.getRemainingUsage());

                            var expLine = expLines[i];

                            if (expLine.custcol_send850) {
                                //nlapiLogExecution('DEBUG', 'expLine', JSON.stringify(expLine));

                                var expItemObj = getExpenseItem(expLinesResults, expLine.account.internalid);
                                if (expItemObj == null) {
                                    expItemObj = getDefaultExpenseItem();
                                }
                                nlapiLogExecution('DEBUG', 'Expense Item Obj', JSON.stringify(expItemObj));

                                if (expItemObj && expItemObj.hasOwnProperty('id')) {
                                    var ts2ExpBpoLineId = null;

                                    var ts2ExpBpoLineRec = nlapiCreateRecord('customrecord_ts_blanket_po_line');
                                    ts2ExpBpoLineRec.setFieldValue('name', releaseHeaderName + '/L' + idx);
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_bpo_no', ts2BlanketPoId);
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_item', expItemObj.id);
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_qty', 1);
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_rate', expLine.amount);

                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts2_bpol_need_qc_inspect', 'T');
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts2_bpol_need_xrf_test', 'T');

                                    if (isValid(bkLine.custcol8)) {
                                        ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_master_ctn_qty', bkLine.custcol8 || 0);
                                    }

                                    if (isValid(bkLine.custcol_innerqty)) {
                                        ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_inner_box_qty', bkLine.custcol_innerqty || 0);
                                    }

                                    try {
                                        ts2ExpBpoLineId = nlapiSubmitRecord(ts2ExpBpoLineRec, true, true);
                                    } catch (ex) {

                                        nlapiLogExecution('ERROR', 'ERROR creating BPO Line for Expense', ex.toString());
                                        interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating BPO Line for Expense failed! ' + ex.toString();
                                        logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                    }

                                    if (ts2ExpBpoLineId) {
                                        var expReleaseHeaderName = releaseHeaderName;
                                        expReleaseHeaderName = expReleaseHeaderName.replace('PO-', 'EX-') + '-' + (i + 1);

                                        var ts2ExpReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');
                                        ts2ExpReleaseHeaderRec.setFieldValue('name', expReleaseHeaderName);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_bpo_no', ts2BlanketPoId);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', (i + 1));
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pj', commons.project.id);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pyt_terms', poJsonObj.terms.internalid);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_release_no', expLine.custcol_release_order_number);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_special_note', poJsonObj.custbodychange_remarks);

                                        if (expLine.isclosed) {
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 6); // Closed / Cancelled
                                            cancelledReleases.push(expLine.custcol_release_order_number)
                                        } else {
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 9); // Pre-approved
                                            newReleases.push(expLine.custcol_release_order_number)
                                        }

                                        if (poJsonObj.hasOwnProperty('custbody_product_manager')) {
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_order_ctc', poJsonObj.custbody_product_manager.name);
                                        }

                                        try {
                                            var ts2ExpReleaseHeaderId = nlapiSubmitRecord(ts2ExpReleaseHeaderRec, true, true);

                                            if (ts2ExpReleaseHeaderId) {
                                                expenseLinesToBeUpdated.push(expLine.custcol_release_order_number);
                                            }

                                            tssMSInterfaceBatchLogRecId = Onepac_InterfaceLog_Object.createInterfaceLog({
                                                code: batch_code,
                                                msPOId: poJsonObj.id,
                                                tranId: poJsonObj.tranid,
                                                tsBPOId: ts2BlanketPoId,
                                                orderNumber: expLine.custcol_release_order_number,
                                                rhId: ts2ExpReleaseHeaderId
                                            });

                                            if (ts2ExpReleaseHeaderId) {

                                                try {
                                                    var ts2ExpReleaseLineRec = Onepac_InterfaceLog.CreateReleaseLine();

                                                    ts2ExpReleaseLineRec = Onepac_InterfaceLog_Process.CreateExpenseReleaseLine(ts2ExpReleaseLineRec,
                                                        poJsonObj,
                                                        expReleaseHeaderName,
                                                        ts2BlanketPoId,
                                                        ts2ExpReleaseHeaderId,
                                                        ts2ExpBpoLineId,
                                                        expLine,
                                                        expItemObj,
                                                        commons);

                                                    var ts2ExpLineId = Onepac_InterfaceLog.SubmitReleaseLine(ts2ExpReleaseLineRec.getRecord(), true, true);
                                                    nlapiLogExecution('DEBUG', 'Expense Line Item Created', ts2ExpLineId);


                                                    checkGovernance();

                                                } catch (ex) {
                                                    nlapiLogExecution('ERROR', 'ERROR creating Expense Line', ex.toString());
                                                    interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating BPO Line for Expense failed! ' + ex.toString();
                                                    logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                                }
                                            }

                                        } catch (ex) {
                                            nlapiLogExecution('ERROR', 'ERROR creating Expense Header 1', ex.toString());
                                            interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Expense Header failed! ' + ex.toString();
                                            logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                        }
                                    }
                                }
                            }

                            idx++;
                        }
                    }
                    /*** End Create BPO Line and Release Header, Release Lines for MS Expense Lines ***/
                    nlapiLogExecution('AUDIT','Item Release 1',releaseLinesToBeUpdated);
                    if (isValid(releaseLinesToBeUpdated) && releaseLinesToBeUpdated.length > 0) {
                        poRec = set850860Lines(poRec, 'item', releaseLinesToBeUpdated);
                    }
                    nlapiLogExecution('AUDIT','Expense Release',expenseLinesToBeUpdated);
                    if (isValid(expenseLinesToBeUpdated) && expenseLinesToBeUpdated.length > 0) {
                        poRec = set850860Lines(poRec, 'expense', expenseLinesToBeUpdated);
                    }

                    nlapiSubmitRecord(poRec, false, true);

                }

                /*** END CREATE ***/

            }
            else {

                nlapiLogExecution('DEBUG', 'Loading TS BPO', tsBPO.getFieldValue('name'));

                /*** START EDIT ***/
                var updateBPOStatus = false;

                var po_line_searchresults = null;

                var latestMSPO = getLatestMSPO(msPoId);

                if (latestMSPO) {
                    nlapiLogExecution('DEBUG', 'Checking MSPO', JSON.stringify(latestMSPO));
                    var mspoJSON = getMSPOJSON(latestMSPO);
                    if (mspoJSON) {
                        latestMSPO = JSON.parse(mspoJSON);
                    }
                }

                if (latestMSPO && msPO.getFieldValue('custbody_maker') !== latestMSPO.custbody_maker.internalid) {
                    nlapiLogExecution('DEBUG', 'Maker Changed', msPO.getFieldValue('custbody_maker') + ' to ' + latestMSPO.custbody_maker.internalid);
                    updateBPOStatus = true;
                }

                if (latestMSPO && msPO.getFieldValue('custbody_factoryname') !== latestMSPO.custbody_factoryname.internalid) {
                    nlapiLogExecution('DEBUG', 'Factory Changed', msPO.getFieldValue('custbody_factoryname') + ' to ' + latestMSPO.custbody_factoryname.internalid);
                    updateBPOStatus = true;
                }
              
              var send850 = get850(latestMSPO.item, bkLine.custcol_release_order_number);
                    var send860 = get860(latestMSPO.item, bkLine.custcol_release_order_number);

                    if (bkLine.custcolsend860 !== send860) {
                        updateBPOStatus = true;
                    }
                    if (bkLine.custcol_send850 !== send850) {
                        updateBPOStatus = true;
                    }


                //get number of release header
                var rl_hdr_count_filters = [];
                rl_hdr_count_filters.push(new nlobjSearchFilter('custrecord_ts2_rlpo_bpo_no', null, 'is', tsBpoId));

                var rl_hdr_count_searchresults = nlapiSearchRecord('customrecord_ts2_rlpo', null, rl_hdr_count_filters) || [];
                var rl_hdr_count = rl_hdr_count_searchresults.length;

                nlapiLogExecution('DEBUG', 'start - rl_hdr_count', rl_hdr_count);

                //store pending bpo lines removal id
                var po_line_filters = [];
                po_line_filters.push(new nlobjSearchFilter('custrecord_ts_bpol_bpo_no', null, 'is', tsBpoId));
                var po_line_columns = [];
                po_line_columns.push(new nlobjSearchColumn('internalId', null, null));

                po_line_columns.push(new nlobjSearchColumn('custrecord_ts_bpol_rate', null, null));
                po_line_searchresults = nlapiSearchRecord('customrecord_ts_blanket_po_line', null, po_line_filters, po_line_columns);

                var bpolIds = [];

                for (var i1 = 0; po_line_searchresults != null && i1 < po_line_searchresults.length; i1++) {

                    var bpolId = po_line_searchresults[i1].getId();
                    var rate = po_line_searchresults[i1].getValue('custrecord_ts_bpol_rate');

                    bpolIds.push({bpolId: bpolId, rate: rate});

                    //var bpolId = po_line_searchresults[i1].getId();
                    //bpolIds.push(bpolId);
                    /*var bpolRec_old = nlapiLoadRecord('customrecord_ts_blanket_po_line', bpolId);
                    bpolRec_old.setFieldValue('name', bpolRec_old.getFieldValue('name') + '_old');
                    nlapiSubmitRecord(bpolRec_old, true, true);*/
                }

                /*** Start Create BPO Lines ***/

                nlapiLogExecution('DEBUG', 'priceQtyMap', priceQtyMap);

                var idx = 1;
                try {
                    var updatedPriceQtyMap = updatePriceQtyMap(bpolIds, priceQtyMap, tsBpoId, tsBPO.getFieldValue('name'), bkLine, poJsonObj, commons, htsCodeObj, idx, bpolPriceMap);
                    bpolPriceMap = updatedPriceQtyMap.bpolPriceMap;
                    //bpolIds = updatedPriceQtyMap.bpolIds;
                    nlapiLogExecution('DEBUG', 'BPO Price Map', bpolPriceMap);
                }
                catch (ex) {
                    nlapiLogExecution('ERROR', 'ERROR creating Blanklet PO Line', ex.toString());
                    interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Blanklet PO Line failed! ' + ex.toString();
                    logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                }

                /*** End Create BPO Lines ***/

                var jsonRLItems = removeBKFromLine(latestMSPO.item);

                var jsonReleaseLineTotalAmount = getReleaseLineTotalAmount(jsonRLItems);
                var rlLinesTotalAmount = getReleaseLineTotalAmount(rlLines);

                if (jsonReleaseLineTotalAmount !== rlLinesTotalAmount) {
                    nlapiLogExecution('DEBUG', 'Release Lines Total Amount Changed', jsonReleaseLineTotalAmount + ' to ' + rlLinesTotalAmount);
                    updateBPOStatus = true;
                }

                /*** Start Create Release Headers ***/
                var releaseHeaderName = tsBPO.getFieldValue('name'); //nlapiLookupField('customrecord_ts_blanket_po', tsBpoId, 'name');
                nlapiLogExecution('DEBUG', 'Release Header Name', releaseHeaderName);

                var INIT_IDX = 0;

                var rl_hdr_searchresults = searchReleaseHeader(rlLines, poJsonObj.tranid);

                for (var i = 0; i < rlLines.length; i++) {
                    nlapiLogExecution('DEBUG', 'loop - rl_hdr_count', rl_hdr_count);
                    nlapiLogExecution('DEBUG', 'RELEASE: remaining usage', context.getRemainingUsage());

                    INIT_IDX++;

                    var releaseLine = rlLines[i];

                    //nlapiLogExecution('DEBUG', 'releaseLine', JSON.stringify(releaseLine));
                    nlapiLogExecution('DEBUG', 'releaseLine.custcolsend860 2', releaseLine.custcolsend860);
                    nlapiLogExecution('DEBUG', 'releaseLine.custcol_send850 2', releaseLine.custcol_send850);

                    

                    if (releaseLine.custcolsend860 || releaseLine.custcol_send850) {

                        var ts2ReleaseHeaderRec;

                        if (isValid(rl_hdr_searchresults) && rl_hdr_searchresults.length > 0) {

                            var rid = getReleaseHeaderId(rl_hdr_searchresults, releaseLine.custcol_release_order_number, poJsonObj.tranid);
                            nlapiLogExecution('DEBUG', 'Release Header ID', rid);

                            if (rid > 0) {

                                //release header exists, load it
                                ts2ReleaseHeaderRec = nlapiLoadRecord('customrecord_ts2_rlpo', rid);
                                if (!releaseLine.isclosed) {
                                    revisedReleases.push(releaseLine.custcol_release_order_number);
                                }
                            } else {

                                ts2ReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');

                                releaseHeaderName = tsBPO.getFieldValue('name').replace('PO-', 'RL-') + '-' + (rl_hdr_count + 1);

                                ts2ReleaseHeaderRec.setFieldValue('name', releaseHeaderName);
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', rl_hdr_count + 1);
                                if (!releaseLine.isclosed) {
                                    newReleases.push(releaseLine.custcol_release_order_number);
                                }
                                if (releaseLine.custcol13 && releaseLine.custcol13 !== 'TBD') {
                                    var customerETD = formatDate(new Date(toMomentDate(releaseLine.custcol13)));
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                                    ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_supplier_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                                }
                                rl_hdr_count++;
                            }

                        } else {

                            //release header not exists, create it
                            ts2ReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');

                            releaseHeaderName = tsBPO.getFieldValue('name').replace('PO-', 'RL-') + '-' + (rl_hdr_count + 1);

                            ts2ReleaseHeaderRec.setFieldValue('name', releaseHeaderName);
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', rl_hdr_count + 1);
                            if (!releaseLine.isclosed) {
                                newReleases.push(releaseLine.custcol_release_order_number);
                            }
                            if (releaseLine.custcol13 && releaseLine.custcol13 !== 'TBD') {
                                var customerETD = formatDate(new Date(toMomentDate(releaseLine.custcol13)));
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_supplier_need_by_dd', customerETD);  // TODO - FIX DATE!!!
                            }
                            rl_hdr_count++;
                        }

                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_bpo_no', tsBpoId);
                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pj', commons.project.id);
                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 9); // Pre-approved

                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_special_note', poJsonObj.custbodychange_remarks);

                        if (commons.maker != null) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_supplier', commons.maker.id);
                        }
                        if (commons.factory != null) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_fty', commons.factory.id);
                        }
                        if (commons.terms != null) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pyt_terms', poJsonObj.terms.internalid);
                        }

                        // Get Addresses
                        var addrObj = null;
                        if (commons.hasOwnProperty('prefix') && releaseLine.hasOwnProperty('custcol_finaldest') && releaseLine.hasOwnProperty('customer')) {
                            addrObj = getAddresses(commons.prefix, releaseLine.custcol_finaldest, releaseLine.customer);

                            if (addrObj.hasOwnProperty('shipto') && addrObj.shipto) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ship_to', addrObj.shipto);
                            }
                            if (addrObj.hasOwnProperty('consignee') && addrObj.consignee) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_consignee', addrObj.consignee);
                            }
                            if (addrObj.hasOwnProperty('notifparty1') && addrObj.notifparty1) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts_rlpo_notify_party', addrObj.notifparty1);
                            }
                            if (addrObj.hasOwnProperty('notifparty2') && addrObj.notifparty2) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_notify_party_2', addrObj.notifparty2);
                            }
                            if (addrObj.hasOwnProperty('notifparty3') && addrObj.notifparty3) {
                                ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_notify_party_3', addrObj.notifparty3);
                            }
                        }

                        if (releaseLine.isclosed) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 6); // Closed / Cancelled
                            cancelledReleases.push(releaseLine.custcol_release_order_number);
                        } else {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 9); // Pre-approved
                        }

                        if (poJsonObj.hasOwnProperty('custbody_product_manager')) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_order_ctc', poJsonObj.custbody_product_manager.name);
                        }


                        if (releaseLine.hasOwnProperty('customer')) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_end_cus', releaseLine.customer.name);
                        }

                        if (releaseLine.hasOwnProperty('custcolb2bcontainer')) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_cont_type', releaseLine.custcolb2bcontainer.name);
                        }

                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_price_sticker', releaseLine.custcol_stickers);
                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pro_bat', releaseLine.custcolprod_batch_letter);

                        if (releaseLine.hasOwnProperty('custcol_finaldest')) {
                            ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_fin_des', releaseLine.custcol_finaldest.name);
                        }

                        if (releaseLine.custcol_release_order_number.match(/^ML/)) {
                            ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_title_transfer', "Material Release");
                        } else {
                            var originPort = poJsonObj.custbodyport_of_origin;

                            if (originPort) {
                                originPort = originPort.toUpperCase();
                            }

                            if (OBJ_PORT_TITLE_MAP.hasOwnProperty(originPort)) {
                                ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_title_transfer', OBJ_PORT_TITLE_MAP[originPort]);
                            }
                        }

                        if (releaseLine.hasOwnProperty('custcoldestport')) {
                            ts2ReleaseHeaderRec.setFieldText('custrecord_ts2_rlpo_port_of_discharge', releaseLine.custcoldestport.name);
                        }

                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_release_no', releaseLine.custcol_release_order_number);
                        ts2ReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_need_by_dd_def', 4);

                        try {

                            var ts2ReleaseHeaderId = nlapiSubmitRecord(ts2ReleaseHeaderRec, true, true);

                            nlapiLogExecution('DEBUG', 'Release Header Created', ts2ReleaseHeaderId);

                            if (ts2ReleaseHeaderId) {
                                releaseLinesToBeUpdated.push(releaseLine.custcol_release_order_number);
                            }

                            tssMSInterfaceBatchLogRecId = Onepac_InterfaceLog_Object.createInterfaceLog({
                                code: batch_code,
                                msPOId: poJsonObj.id,
                                tranId: poJsonObj.tranid,
                                tsBPOId: tsBpoId,
                                rhId: ts2ReleaseHeaderId,
                                orderNumber: releaseLine.custcol_release_order_number
                            });

                            nlapiLogExecution('DEBUG', 'Interfacelog for Release Header Created', tssMSInterfaceBatchLogRecId);

                            if (ts2ReleaseHeaderId) {

                                var ts2ReleaseLineRec = {};
                                //PG changed 20171221
                                //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',rl_hdr_searchresults.length);
                                if (rl_hdr_searchresults && rl_hdr_searchresults.length > 0) {
                                    //release header exists, load line
                                    //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',1);
                                    var rl_line_filters = [];
                                    if (releaseLine.custcol_release_order_number) {
                                        rl_line_filters.push(new nlobjSearchFilter('custbody_ts_rspo_customer_release_no', null, 'is', releaseLine.custcol_release_order_number));
                                    }
                                    rl_line_filters.push(new nlobjSearchFilter('custbody_ts2_rspol_rlpo_no', null, 'is', ts2ReleaseHeaderId));
                                    //rl_line_filters.push(new nlobjSearchFilter('type', null, 'is', 'purchaseorder'));
                                    var rl_line_columns = [];
                                    rl_line_columns.push(new nlobjSearchColumn('internalId', null, null));
                                    //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',2);

                                    var rl_line_searchresults = nlapiSearchRecord('purchaseorder', null, rl_line_filters, rl_line_columns);
                                    //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',3);

                                    if (rl_line_searchresults && rl_line_searchresults.length > 0) {

                                        // ts2ReleaseLineRec = nlapiLoadRecord('purchaseorder', rl_line_searchresults[0].getValue('internalId'), {
                                        //     recordmode: 'dynamic'
                                        // });

                                        ts2ReleaseLineRec = Onepac_InterfaceLog.CreateReleaseLine(rl_line_searchresults[0].getValue('internalId'));
                                        //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',4);

                                        //nlapiLogExecution('DEBUG', 'ts2ReleaseLineRec', rl_line_searchresults[0].getValue('internalId'));
                                        //ts2ReleaseLineRec.setFieldValue('custbody_ts2_rspol_bpol_no', null);
                                        //ts2ReleaseLineRec.selectLineItem('item', 1);
                                        //ts2ReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_bpo_line_no', null);
                                        //ts2ReleaseLineRec.setCurrentLineItemValue('item', 'item', commons.itemobj.id);
                                        //ts2ReleaseLineRec.commitLineItem('item');

                                        //ts2ReleaseLineId = nlapiSubmitRecord(ts2ReleaseLineRec, true, true);

                                        //ts2ReleaseLineRec = nlapiLoadRecord('purchaseorder', rl_line_searchresults[0].getValue('internalId'), {recordmode: 'dynamic'});
                                    } else {
                                        //release header not exists, create line
                                        // ts2ReleaseLineRec = nlapiCreateRecord('purchaseorder');
                                        // ts2ReleaseLineRec.setFieldValue('subsidiary', 6);
                                        // ts2ReleaseLineRec.setFieldValue('tranid', releaseHeaderName + '-1');
                                        // ts2ReleaseLineRec.setFieldValue('custbody_ts_rspo_release_status', 9); // Pre-approved

                                        ts2ReleaseLineRec = Onepac_InterfaceLog.CreateReleaseLine();

                                    }
                                } else {
                                    //release header not exists, create line
                                    // ts2ReleaseLineRec = nlapiCreateRecord('purchaseorder');
                                    // ts2ReleaseLineRec.setFieldValue('subsidiary', 6);
                                    // ts2ReleaseLineRec.setFieldValue('tranid', releaseHeaderName + '-1');

                                    ts2ReleaseLineRec = Onepac_InterfaceLog.CreateReleaseLine();

                                }

                                //var ts2ReleaseLineRec = nlapiCreateRecord('purchaseorder', {recordmode: 'dynamic'});
                                //var ts2ReleaseLineRec = nlapiCreateRecord('purchaseorder');

                                ts2ReleaseLineRec = Onepac_InterfaceLog_Process.CreateReleaseLine(ts2ReleaseLineRec, poJsonObj, releaseHeaderName, tsBpoId, ts2ReleaseHeaderId, releaseLine, commons, addrObj, htsCodeObj, bpolPriceMap);

                                try {

                                    //var ts2ReleaseLineId = nlapiSubmitRecord(ts2ReleaseLineRec, true, true);
                                    nlapiLogExecution('DEBUG', 'Release Line Rec', JSON.stringify(ts2ReleaseLineRec));
                                    var ts2ReleaseLineId = Onepac_InterfaceLog.SubmitReleaseLine(ts2ReleaseLineRec.getRecord(), true, true);



                                } catch (ex) {
                                    nlapiLogExecution('DEBUG', 'ERROR creating Release Line 2', ex.toString());
                                }
                            }

                        } catch (ex) {
                            nlapiLogExecution('ERROR', 'ERROR creating Release Header', ex.toString());
                        }
                    }
                }
                /*** End Create Release Headers ***/

                /*** Start Create BPO Line and Release Header, Release Lines for MS Expense Lines ***/
                if (isValid(expLines) && expLines.length > 0) {

                    //var expReleaseHeaderName =  tsBPO.getFieldValue('name');//nlapiLookupField('customrecord_ts_blanket_po', tsBpoId, 'name');
                    var expLinesResults = searchExpenseItems(expLines);
                    if (expLinesResults == null) {
                        interfaceWarning += '<BR><B style="COLOR: red">ERROR:</B>Expense Account to Item mapping not found. Please create the appropriate mappings first.';
                        nlapiLogExecution('ERROR', 'ERROR', 'Expense Account to Item mapping not found. Please create the appropriate mappings first.');
                    }
                    var rl_hdr_searchresults = searchReleaseHeader(expLines, poJsonObj.tranid);

                    for (var i = 0; i < expLines.length; i++) {
                        nlapiLogExecution('DEBUG', 'EXPENSE: remaining usage', context.getRemainingUsage());

                        var expLine = expLines[i];

                        if (expLine.custcolsend860 || expLine.custcol_send850) {
                            //nlapiLogExecution('DEBUG', 'expLine', JSON.stringify(expLine));

                            var expItemObj = getExpenseItem(expLinesResults, expLine.account.internalid);
                            if (expItemObj == null) {
                                expItemObj = getDefaultExpenseItem();
                            }
                            nlapiLogExecution('DEBUG', 'Expense Item Obj', JSON.stringify(expItemObj));

                            if (expItemObj && expItemObj.hasOwnProperty('id')) {
                                var ts2ExpBpoLineId = null;

                                var ts2ExpBpoLineRec = nlapiCreateRecord('customrecord_ts_blanket_po_line');
                                ts2ExpBpoLineRec.setFieldValue('name', tsBPO.getFieldValue('name') + '/L' + idx);
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_bpo_no', tsBpoId);
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_item', expItemObj.id);
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_qty', 1);
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_rate', expLine.amount);
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts2_bpol_need_qc_inspect', 'T');
                                ts2ExpBpoLineRec.setFieldValue('custrecord_ts2_bpol_need_xrf_test', 'T');
                                if (isValid(bkLine.custcol8)) {
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_master_ctn_qty', bkLine.custcol8 || 0);
                                }

                                if (isValid(bkLine.custcol_innerqty)) {
                                    ts2ExpBpoLineRec.setFieldValue('custrecord_ts_bpol_inner_box_qty', bkLine.custcol_innerqty || 0);
                                }
                                try {
                                    ts2ExpBpoLineId = nlapiSubmitRecord(ts2ExpBpoLineRec, true, true);

                                } catch (ex) {
                                    nlapiLogExecution('ERROR', 'ERROR creating BPO Line for Expense', ex.toString());
                                    interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating BPO Line for Expense failed! ' + ex.toString();
                                    logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                }

                                if (ts2ExpBpoLineId) {

                                    var expReleaseHeaderName = tsBPO.getFieldValue('name').replace('PO-', 'RL-') + '-' + (i + 1);
                                    //nlapiLogExecution('DEBUG', 'expReleaseHeaderName', expReleaseHeaderName);


                                    //PG changed 20171221
                                    //check expense header exists

                                    //nlapiLogExecution('DEBUG', 'Log', 'check expense header exists start');
                                    /*var rl_hdr_filters = [];
                                    rl_hdr_filters.push(new nlobjSearchFilter('custrecord_ts2_rlpo_customer_release_no', null, 'contains', expLine.custcol_release_order_number));
                                    rl_hdr_filters.push(new nlobjSearchFilter('custrecord_ts2_rlpo_customer_order_no', null, 'contains', poJsonObj.tranid));

                                    var rl_hdr_columns = [];
                                    rl_hdr_columns.push(new nlobjSearchColumn('internalId', null, null));

                                    rl_hdr_searchresults = nlapiSearchRecord('customrecord_ts2_rlpo', null, rl_hdr_filters, rl_hdr_columns);
                                    */

                                    var ts2ExpReleaseHeaderRec;

                                    if (rl_hdr_searchresults && rl_hdr_searchresults.length > 0) {

                                        var rid = getReleaseHeaderId(rl_hdr_searchresults, expLine.custcol_release_order_number, poJsonObj.tranid);
                                        if (rid > 0) {
                                            ts2ExpReleaseHeaderRec = nlapiLoadRecord('customrecord_ts2_rlpo', rid);
                                            revisedReleases.push(expLine.custcol_release_order_number);
                                        } else {
                                            //release header not exists, create it
                                            ts2ExpReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');

                                            //
                                            ts2ExpReleaseHeaderRec.setFieldValue('name', expReleaseHeaderName);
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', rl_hdr_count + 1);
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                                            ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_release_no', expLine.custcol_release_order_number);
                                            newReleases.push(expLine.custcol_release_order_number);
                                            rl_hdr_count++;
                                        }

                                    } else {
                                        //release header not exists, create it
                                        ts2ExpReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');

                                        //
                                        ts2ExpReleaseHeaderRec.setFieldValue('name', expReleaseHeaderName);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', rl_hdr_count + 1);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_release_no', expLine.custcol_release_order_number);

                                        rl_hdr_count++;
                                    }
                                    //nlapiLogExecution('DEBUG', 'Log', 'check release header exists end');

                                    ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_special_note', poJsonObj.custbodychange_remarks);
                                    // var ts2ExpReleaseHeaderRec = nlapiCreateRecord('customrecord_ts2_rlpo');
                                    // ts2ExpReleaseHeaderRec.setFieldValue('name', expReleaseHeaderName);
                                    //ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts_bpo_subsidary', 6);
                                    ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_bpo_no', tsBpoId);
                                    //ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_release_no', (i + 1));
                                    ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pj', commons.project.id);
                                    ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_pyt_terms', poJsonObj.terms.internalid);

                                    if (expLine.isclosed) {
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 6); // Closed / Cancelled
                                        cancelledReleases.push(expLine.custcol_release_order_number);
                                    } else {
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_status', 9); // Pre-approved
                                        newReleases.push(expLine.custcol_release_order_number);
                                    }

                                    if (poJsonObj.hasOwnProperty('custbody_product_manager')) {
                                        ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_customer_order_ctc', poJsonObj.custbody_product_manager.name);
                                    }

                                    //                                      if (itemLineObj.hasOwnProperty('customer')) {
                                    //                                      ts2ExpReleaseHeaderRec.setFieldValue('custrecord_ts2_rlpo_ms_end_cus', releaseLine.customer.name);
                                    //                                      }

                                    try {
                                        var ts2ExpReleaseHeaderId = nlapiSubmitRecord(ts2ExpReleaseHeaderRec, true, true);

                                        if(ts2ExpReleaseHeaderId){
                                            expenseLinesToBeUpdated.push(expLine.custcol_release_order_number);
                                        }
                                        //nlapiLogExecution('DEBUG', 'ts2ExpReleaseHeaderId', ts2ExpReleaseHeaderId);


                                        /*var tssMSInterfaceBatchLogRec = nlapiCreateRecord('customrecord_tss_ms_interface_batch_log');
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_code', batch_code);
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_ms_po_id', poJsonObj.id);
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_ob', poJsonObj.tranid);
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_po', tsBpoId);
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_oh', expLine.custcol_release_order_number);
                                        tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_rpo', ts2ExpReleaseHeaderId);

                                        tssMSInterfaceBatchLogRecId = nlapiSubmitRecord(tssMSInterfaceBatchLogRec, true, true);*/

                                        tssMSInterfaceBatchLogRecId = Onepac_InterfaceLog_Object.createInterfaceLog({
                                            code: batch_code,
                                            msPOId: poJsonObj.id,
                                            tranId: poJsonObj.tranid,
                                            tsBPOId: tsBpoId,
                                            rhId: ts2ExpReleaseHeaderId,
                                            orderNumber: expLine.custcol_release_order_number
                                        });

                                        if (ts2ExpReleaseHeaderId && expLine.custcol_release_order_number) {

                                            var ts2ExpReleaseLineRec = {};
                                            //PG changed 20171221
                                            //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',rl_hdr_searchresults.length);
                                            //if (isValid(rl_hdr_searchresults) && rl_hdr_searchresults.length > 0) {
                                            //release header exists, load line
                                            //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',1);
                                            var rl_line_filters = [];
                                            if (expLine.custcol_release_order_number) {
                                                rl_line_filters.push(new nlobjSearchFilter('custbody_ts_rspo_customer_release_no', null, 'is', expLine.custcol_release_order_number));
                                            }
                                            rl_line_filters.push(new nlobjSearchFilter('custbody_ts2_rspol_rlpo_no', null, 'is', ts2ExpReleaseHeaderId));
                                            //rl_line_filters.push(new nlobjSearchFilter('type', null, 'is', 'purchaseorder'));
                                            var rl_line_columns = [];
                                            rl_line_columns.push(new nlobjSearchColumn('internalId', null, null));
                                            //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',2);

                                            var rl_line_searchresults = nlapiSearchRecord('purchaseorder', null, rl_line_filters, rl_line_columns);
                                            //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',3);

                                            //nlapiLogExecution('DEBUG', 'Expense Line', rl_line_searchresults);

                                            if (rl_line_searchresults && rl_line_searchresults.length > 0) {
                                                ts2ExpReleaseLineRec = nlapiLoadRecord('purchaseorder', rl_line_searchresults[0].getValue('internalId'), {
                                                    recordmode: 'dynamic'
                                                });
                                            } else {
                                                ts2ExpReleaseLineRec = nlapiCreateRecord('purchaseorder');
                                                ts2ExpReleaseLineRec.setFieldValue('exchangerate', 1);
                                                ts2ExpReleaseLineRec.setFieldValue('subsidiary', 6);
                                                ts2ExpReleaseLineRec.setFieldValue('tranid', expReleaseHeaderName + '-1');
                                                ts2ExpReleaseLineRec.setFieldValue('entity', commons.maker.id);
                                            }

                                            //nlapiLogExecution('DEBUG', 'rl_hdr_searchresults',4);

                                            //nlapiLogExecution('DEBUG', 'ts2ReleaseLineRec', rl_line_searchresults[0].getValue('internalId'));
                                            // } else {
                                            //     //release header not exists, create line
                                            //     ts2ExpReleaseLineRec = nlapiCreateRecord('purchaseorder');
                                            //     ts2ExpReleaseLineRec.setFieldValue('exchangerate', 1);
                                            //     ts2ExpReleaseLineRec.setFieldValue('subsidiary', 6);
                                            //     ts2ExpReleaseLineRec.setFieldValue('tranid', expReleaseHeaderName + '-1');
                                            //     ts2ExpReleaseLineRec.setFieldValue('entity', commons.maker.id);
                                            // }


                                            // var ts2ExpReleaseLineRec = nlapiCreateRecord('purchaseorder');
                                            ts2ExpReleaseLineRec.setFieldValue('customform', 157);
                                            //ts2ExpReleaseLineRec.setFieldValue('entity', commons.maker.id);
                                            //ts2ExpReleaseLineRec.setFieldValue('subsidiary', 6);
                                            ts2ExpReleaseLineRec.setFieldValue('location', 4497); // ThreeSixty
                                            ts2ExpReleaseLineRec.setFieldValue('custrecord_ts2_bpol_subsi', 6);
                                            //ts2ExpReleaseLineRec.setFieldValue('tranid', expReleaseHeaderName + '-1');
                                            ts2ExpReleaseLineRec.setFieldValue('trandate', poJsonObj.trandate);
                                            //                                                ts2ExpReleaseLineRec.setFieldValue('custbody_ts_rspo_ship_to', addrObj.shipto);
                                            ts2ExpReleaseLineRec.setFieldValue('currency', poJsonObj.currency.internalid);
                                            ts2ExpReleaseLineRec.setFieldValue('terms', poJsonObj.terms.internalid);
                                            ts2ExpReleaseLineRec.setFieldValue('custbodyts_rspo_bpo_no', tsBpoId);
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rspol_rlpo_no', ts2ExpReleaseHeaderId);
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rspol_bpol_no', ts2ExpBpoLineId);
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts_rspo_customer_release_no', expLine.custcol_release_order_number);

                                            if (expLine.isclosed) {
                                                ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rspol_closed', 'T'); // Closed / Cancelled
                                            }

                                            //                                              if (itemLineObj.hasOwnProperty('customer')) {
                                            //                                              ts2ExpReleaseLineRec.setFieldValue('custbody_ts_rspo_ms_end_customer_name', releaseLine.customer.name);
                                            //                                              }

                                            //                                              ts2ReleaseLineRec.setFieldValue('custbody_ts_rspo_ms_composite_no', releaseLine.); - TODO - FIX!!!
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rspol_item', expItemObj.id);
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rlpol_item_name', expItemObj.name);
                                            ts2ExpReleaseLineRec.setFieldValue('custbody_ts2_rspol_qty', 1);
                                            //                                              ts2ReleaseLineRec.setFieldValue('custbody_ts2_rlpol_ms_spec_rfq', expLine.); // TODO - FIX This!!!

                                            // Set the item line sublist value
                                            if (isValid(rl_line_searchresults) && rl_line_searchresults.length > 0) {
                                                ts2ExpReleaseLineRec.selectLineItem('item', 1);
                                                //                                      ts2ReleaseLineRec.selectNewLineItem('item');
                                            } else {
                                                ts2ExpReleaseLineRec.selectNewLineItem('item');
                                                ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_po_line_no', expReleaseHeaderName + '-1');
                                            }

                                            //ts2ExpReleaseLineRec.selectNewLineItem('item');
                                            //ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_po_line_no', expReleaseHeaderName + '-1');
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_rspol_bpo_line_no', ts2ExpBpoLineId);
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'item', expItemObj.id);
                                            //                                              ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'location', 4497);
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'custcol_release_order_number', expReleaseHeaderName); //nlapiLookupField('customrecord_ts2_rlpo', ts2ExpReleaseHeaderId, 'name'));
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_item_name', expItemObj.name);
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'price', expLine.amount);
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'quantity', 1);
                                            ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'amount', expLine.amount);
                                            //                                              ts2ReleaseLineRec.setCurrentLineItemValue('item', 'custcol_ts_rspo_special_rfq', expLine.); // TODO - Get this from the item record
                                            //                                              ts2ReleaseLineRec.setCurrentLineItemValue('item', 'unit', expLine.); // TODO - cant find

                                            if (expLine.isclosed) {
                                                ts2ExpReleaseLineRec.setCurrentLineItemValue('item', 'isclosed', 'T');
                                            }

                                            ts2ExpReleaseLineRec.commitLineItem('item');

                                            try {
                                                var ts2ExpLineId = nlapiSubmitRecord(ts2ExpReleaseLineRec, true, true);
                                                checkGovernance();
                                                //nlapiLogExecution('DEBUG', 'ts2ExpLineId', ts2ExpLineId);

                                                //                                                  nlapiAttachRecord('customrecord_ts2_rlpo', ts2ReleaseHeaderId, 'purchaseorder', ts2ReleaseLineId);

                                                // if (ts2ExpLineId) {
                                                //
                                                // }

                                            } catch (ex) {
                                                nlapiLogExecution('DEBUG', 'ERROR creating Expense Line 2', ex.toString());
                                                interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Expense Line failed! ' + ex.toString();
                                                logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                            }
                                        }

                                    } catch (ex) {
                                        nlapiLogExecution('ERROR', 'ERROR creating Expense Header 2', ex.toString());
                                        interfaceError += '<BR><B style="COLOR: red">ERROR:</B> creating Expense Header failed! ' + ex.toString();
                                        logRec.setFieldValue('custrecord_ts2_interface_has_error', 'T');
                                    }
                                }
                            }
                        }

                        idx++;
                    }
                }


                /*** End Create BPO Line and Release Header, Release Lines for MS Expense Lines ***/

                //nlapiLogExecution('DEBUG', 'releaseLinesToBeUpdated', releaseLinesToBeUpdated.length);
                //nlapiLogExecution('DEBUG', 'releaseLinesToBeUpdated', JSON.stringify(releaseLinesToBeUpdated));
                nlapiLogExecution('AUDIT','Item Release 2',releaseLinesToBeUpdated);
                if (isValid(releaseLinesToBeUpdated) && releaseLinesToBeUpdated.length > 0) {
                    poRec = set850860Lines(poRec, 'item', releaseLinesToBeUpdated);
                }
                nlapiLogExecution('AUDIT','Expense Release',expenseLinesToBeUpdated);
                if (isValid(expenseLinesToBeUpdated) && expenseLinesToBeUpdated.length > 0) {
                    poRec = set850860Lines(poRec, 'expense', expenseLinesToBeUpdated);
                }

                nlapiSubmitRecord(poRec, false, true);

                if (updateBPOStatus) {
                    nlapiSubmitField('customrecord_ts_blanket_po', tsBpoId, 'custrecord_ts_bpo_po_status', 11); // Set BPO status to Pre-approved
                }

                //relinkBPOLines(bpolIds, bpolPriceMap);

                var detachbpolIds = removeLines(bpolIds, priceQtyMap);
                nlapiLogExecution('AUDIT', 'To be detached', JSON.stringify(detachbpolIds));

                detachBPOLines.detachBPOLines(detachbpolIds);

                deleteBPOLines(detachbpolIds);

                updateBPOLineName(bpolPriceArr);


            }


        }


        if (logRec.getFieldValue('custrecord_ts2_interface_has_error') === 'T') {
            logRec.setFieldValue('custrecord_ts2_interface_log_error', interfaceError);
            logRec.setFieldValue('custrecord_ts2_interface_log_warning', interfaceWarning);
            nlapiSubmitRecord(logRec, null, true);

            if (tssMSInterfaceBatchLogRecId !== 0) {
                nlapiSubmitField('customrecord_tss_ms_interface_batch_log', tssMSInterfaceBatchLogRecId,
                    ['custrecord_tss_ms_batch_log_warning', 'custrecord_tss_ms_batch_log_error'],
                    [interfaceWarning, interfaceError]);
            }

        } else {
            logRec.setFieldValue('custrecord_ts2_interface_log_tobeprocess', 'F');
            logRec.setFieldValue('custrecord_ts2_interface_log_error', interfaceError);
            logRec.setFieldValue('custrecord_ts2_interface_log_warning', interfaceWarning);
            nlapiSubmitRecord(logRec, null, true);
        }

    } catch (ex) {

        nlapiLogExecution('ERROR', 'Global ERROR', ex);
        interfaceError += '<BR><B style="COLOR: red">ERROR:</B>' + ex;

        logRec.setFieldValue('custrecord_ts2_interface_log_error', interfaceError);
        logRec.setFieldValue('custrecord_ts2_interface_log_warning', interfaceWarning);
        nlapiSubmitRecord(logRec, null, true);

        if (tssMSInterfaceBatchLogRecId !== 0) {

            nlapiSubmitField('customrecord_tss_ms_interface_batch_log', tssMSInterfaceBatchLogRecId,
                ['custrecord_tss_ms_batch_log_warning', 'custrecord_tss_ms_batch_log_error'],
                [interfaceWarning, interfaceError]);

        } else {

            /*var tssMSInterfaceBatchLogRec = nlapiCreateRecord('customrecord_tss_ms_interface_batch_log');
            tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_code', batch_code);
            tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_ms_po_id', msPoId);
            tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_ob', msPoId);
            tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_warning', '');
            tssMSInterfaceBatchLogRec.setFieldValue('custrecord_tss_ms_batch_log_error', ex.message);

            tssMSInterfaceBatchLogRecId = nlapiSubmitRecord(tssMSInterfaceBatchLogRec, true, true);*/

            Onepac_InterfaceLog_Object.createInterfaceLog({
                code: batch_code,
                msPOId: msPoId,
                tranId: msPoId,
                log_warning: '',
                log_error: ex.message
            });

        }
    }
}


function deleteBPOLines(bpolIds) {

    if (isValid(bpolIds)) {
        for (var ii = 0; ii < bpolIds.length; ii++) {
            var bpolId = bpolIds[ii].bpolId;

            try {
                nlapiDeleteRecord('customrecord_ts_blanket_po_line', bpolId);
            } catch (ex) {
                nlapiLogExecution('ERROR', 'Problem deleting po_line: ' + bpolId, ex.toString());

                var bpolRec_old = nlapiLoadRecord('customrecord_ts_blanket_po_line', bpolId);
                var org_name = bpolRec_old.getFieldValue('name');
                bpolRec_old.setFieldValue('name', org_name.substr(0, org_name.length - 4));
                nlapiSubmitRecord(bpolRec_old, true, true);
            }
        }
    }


}

function set850860Lines(poRec, sublistId, lineItems) {

    for (var rlIdx = 0; rlIdx < lineItems.length; rlIdx++) {

        /*var is850 = poRec.getLineItemValue(sublistId, 'custcol_send850', lineItems[rlIdx]);

        if (is850 === 'T') {
            poRec.setLineItemValue(sublistId, 'custcol_send850', lineItems[rlIdx], 'F');
            poRec.setLineItemValue(sublistId, 'custcolsent_850', lineItems[rlIdx], 'T');
        }

        var is860 = poRec.getLineItemValue(sublistId, 'custcolsend860', lineItems[rlIdx]);

        if (is860 === 'T') {
            poRec.setLineItemValue(sublistId, 'custcolsend860', lineItems[rlIdx], 'F');
        }*/


        for(var i = 0; i < poRec.getLineItemCount(sublistId); i++){

            var releaseNo = poRec.getLineItemValue(sublistId, 'custcol_release_order_number', (i+1));
            var is850 = poRec.getLineItemValue(sublistId, 'custcol_send850', (i+1));
            var is860 = poRec.getLineItemValue(sublistId, 'custcolsend860', (i+1));

            if(releaseNo === lineItems[rlIdx]){
                if(is850 === 'T'){
                    poRec.setLineItemValue(sublistId, 'custcol_send850', (i+1), 'F');
                    poRec.setLineItemValue(sublistId, 'custcolsent_850', (i+1), 'T');
                }
                if(is860 === 'T'){
                    poRec.setLineItemValue(sublistId, 'custcolsend860', (i+1), 'F');
                }
            }

        }


    }

    return poRec;
}

function updateBPOLineName(bpolIds) {

    if (isValid(bpolIds)) {
        for (var i = 0; i < bpolIds.length; i++) {
            try {
                var bpolRec_old = nlapiLoadRecord('customrecord_ts_blanket_po_line', bpolIds[i]);
                var org_name = bpolRec_old.getFieldValue('name'); //nlapiLookupField('customrecord_ts_blanket_po_line', bpolId, 'name');
                if (isValid(org_name)) {
                    bpolRec_old.setFieldValue('name', org_name.substr(0, org_name.length - 4));
                }
                nlapiSubmitRecord(bpolRec_old, true, true);
            } catch (ex) {
                nlapiLogExecution('ERROR', 'Problem rename po_line: ', bpolIds[i], ex.toString());
            }
        }
    }

}


function getAddresses(prefix, locationObj, customerObj) {
    nlapiLogExecution('DEBUG', 'getAddresses', "prefix: " + prefix + "<br/>locationObj: " + JSON.stringify(locationObj) + "<br/>customerId: " + JSON.stringify(customerObj));

    var addressObj = {};

    if ((locationObj.name).indexOf('POE ') === 0) { // POE Location
        var poeMappingSearch = nlapiSearchRecord("customrecord_ts2_poe_mapping", null, [
            ["custrecord_ts2_poe_mapping_customer", "anyof", customerObj.internalid],
            "AND", ["custrecord_ts2_poe_mapping_location", "anyof", locationObj.internalid]
        ], [
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_consignee", null, null),
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_shipto", null, null),
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_forwarder", null, null),
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_notifyparty1", null, null),
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_notifyparty2", null, null),
            new nlobjSearchColumn("custrecord_ts2_poe_mapping_finaldest", null, null)
        ]);

        if (poeMappingSearch && poeMappingSearch.length > 0) {
            var poeMapRes = poeMappingSearch[0];

            addressObj = {
                consignee: poeMapRes.getValue('custrecord_ts2_poe_mapping_consignee'),
                shipto: poeMapRes.getValue('custrecord_ts2_poe_mapping_shipto'),
                forwarder: poeMapRes.getValue('custrecord_ts2_poe_mapping_forwarder'),
                notifparty1: poeMapRes.getValue('custrecord_ts2_poe_mapping_notifyparty1'),
                notifparty2: poeMapRes.getValue('custrecord_ts2_poe_mapping_notifyparty2'),
                notifparty3: addressObj.notifparty1,
                notifparty4: addressObj.notifparty2,
                finaldest: poeMapRes.getValue('custrecord_ts2_poe_mapping_finaldest')
            };
        }

    } else { // NON-POE
        var locationRec = nlapiLoadRecord('location', locationObj.internalid);
        var locJsonObj = getJsonObj(locationRec);

        addressObj.shipto = checkShipTo(prefix + "-" + locJsonObj.name, locJsonObj.mainaddress_text, locJsonObj.addrphone, locJsonObj.attention);
        //        nlapiLogExecution('DEBUG', "addressObj['shipto']", JSON.stringify(addressObj['shipto']));

        if (!addressObj.shipto) {
            // Create SHIP TO
            var shipToRec = nlapiCreateRecord('customrecord_ts_asn_end_customer_list');
            shipToRec.setFieldValue('name', prefix + "-" + locationObj.name);
            shipToRec.setFieldValue('custrecord_shipto_address', locJsonObj.addrtext);

            if (locJsonObj.hasOwnProperty('attention')) {
                shipToRec.setFieldValue('custrecord_shipto_contact', locJsonObj.attention);
            }

            if (locJsonObj.hasOwnProperty('addrphone')) {
                shipToRec.setFieldValue('custrecord_shipto_phone', locJsonObj.addrphone);
            }

            shipToRec.setFieldValue('custrecord_ts2_ship_to_name', locationObj.name);

            addressObj.shipto = nlapiSubmitRecord(shipToRec, true, true);

            if (addressObj.shipto) {
                nlapiSubmitField('customrecord_ts_asn_end_customer_list', addressObj.shipto, 'name', prefix + "-" + locationObj.name + "-" + addressObj.shipto);
            }
        }

        if (SUB_CONFIG.hasOwnProperty('custrecord_ts2_sub_setting_def_consignee')) {
            addressObj.consignee = SUB_CONFIG.custrecord_ts2_sub_setting_def_consignee.internalid;
        }
        if (SUB_CONFIG.hasOwnProperty('custrecord_ts2_sub_setting_def_not_party')) {
            addressObj.notifparty1 = SUB_CONFIG.custrecord_ts2_sub_setting_def_not_party.internalid;
        }
        if (SUB_CONFIG.hasOwnProperty('custrecord_ts2_sub_setting_def_not_par_2')) {
            addressObj.notifparty2 = SUB_CONFIG.custrecord_ts2_sub_setting_def_not_par_2.internalid;
        }
        if (SUB_CONFIG.hasOwnProperty('custrecord_ts2_sub_setting_def_not_par_3')) {
            addressObj.notifparty3 = SUB_CONFIG.custrecord_ts2_sub_setting_def_not_par_3.internalid;
        }
        if (SUB_CONFIG.hasOwnProperty('custrecord_ts2_sub_setting_def_forwarder')) {
            addressObj.forwarder = SUB_CONFIG.custrecord_ts2_sub_setting_def_forwarder.internalid;
        }
    }

    nlapiLogExecution('DEBUG', 'addressObj', JSON.stringify(addressObj));

    return addressObj;
}


function checkGovernance() {

    if (nlapiGetContext().getRemainingUsage() < 300) {

        var state = nlapiYieldScript();
        if (state.status === 'FAILURE') {
            throw nlapiCreateError('YIELD_SCRIPT_ERROR', 'Failed to yield script, exiting<br/>Reason = ' + state.reason + '<br/>Size = ' + state.size + '<br/>Information = ' + state.information);
        } else if (state.status === 'RESUME') {
            nlapiLogExecution("AUDIT", "Resuming script because of " + state.reason + ".  Size = " + state.size);
        }

    } else {
        nlapiGetContext().setPercentComplete((10000 - nlapiGetContext().getRemainingUsage()) / 100);
    }

}

function removeExisting(bpoLines, filteredBpolines) {
    var bpolIds = [];
    nlapiLogExecution('DEBUG', 'filteredBpolines', filteredBpolines);
    for (var i = 0; i < filteredBpolines.length; i++) {
        var bpoLine = getBPOLinebyId(bpoLines, filteredBpolines[i]);
        if (bpoLine) {
            bpolIds.push(bpoLine.id);
        }
    }
    nlapiLogExecution('DEBUG', 'BPO LINE 3', bpolIds);
    return bpolIds;
}

function getBPOLinebyId(bpoLines, bpolId) {

    var bpoline = null;
    bpoLines.forEach(function (bpoLine) {

        if (bpoLine.id === bpolId) {
            nlapiLogExecution('DEBUG', 'BPO LINE 2', bpoLine.id + ' vs ' + bpolId);
            bpoline = bpoLine;
        }
        return true;
    });
    return bpoline;

}

function getBPOLinewithQtyMap(priceQtyMap, ts2BlanketPoId) {

    var rates = [];
    for (var r in priceQtyMap) {
        rates.push(r);
    }
    nlapiLogExecution('DEBUG', 'Rates', rates);

    var filters = []
    filters.push(new nlobjSearchFilter('custrecord_ts_bpol_bpo_no', null, 'is', ts2BlanketPoId));
    filters.push(new nlobjSearchFilter('custrecord_ts_bpol_rate', null, 'anyof', rates));
    var columns = [];
    columns.push(new nlobjSearchColumn('custrecord_ts_bpol_rate'));
    return nlapiSearchRecord('customrecord_ts_blanket_po_line', null, filters, columns) || [];

}

function bpoLineRateMapping(rate, bpolIds) {
    var bpolId = null;
    bpolIds.forEach(function (line) {
        if (line.rate === rate) {
            bpolId = line;
        }
        return true;
    });
    return bpolId;
}


function updatePriceQtyMap(bpolIds, priceQtyMap, ts2BlanketPoId, releaseHeaderName, bkLine, poJsonObj, commons, htsCodeObj, idx, bpolPriceMap, bpolPriceArr) {

    //var bpoLines = getBPOLinewithQtyMap(priceQtyMap, ts2BlanketPoId);

    //var existingbpoLines = [];

    for (var p in priceQtyMap) {


        //var bpoLineId = bpoLineRateMapping(p, bpoLines);
        //nlapiLogExecution('DEBUG', 'Working with bpoLineId', bpoLineId);
        var bpoLine = bpoLineRateMapping(p, bpolIds);


        var ts2BlanketPoLineRec = {};

        if (!bpoLine) {
            nlapiLogExecution('AUDIT', 'New', p);
            ts2BlanketPoLineRec = nlapiCreateRecord('customrecord_ts_blanket_po_line');
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_bpo_no', ts2BlanketPoId);
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_rate', p);
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_ms_edit_unit_price', p);
        } else {
            ts2BlanketPoLineRec = nlapiLoadRecord('customrecord_ts_blanket_po_line', bpoLine.bpolId);
            nlapiLogExecution('AUDIT', 'Updating', JSON.stringify(bpoLine));
        }


        //var ts2BlanketPoLineRec = nlapiCreateRecord('customrecord_ts_blanket_po_line');
ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_line_status', 9);
        ts2BlanketPoLineRec.setFieldValue('name', releaseHeaderName + '/L' + idx);
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_item', commons.itemobj.id);
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_customer_item_no', commons.itemobj.msname);
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_item_descpt', bkLine.description);
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_qty', priceQtyMap[p]);
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_ms_edi_quantity', priceQtyMap[p]);


        if (isValid(bkLine.custcol8)) {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_master_ctn_qty', bkLine.custcol8 || 0);
        }

        if (isValid(bkLine.custcol_innerqty)) {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_inner_box_qty', bkLine.custcol_innerqty || 0);
        }

        ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_need_qc_inspect', 'T');
        ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_need_xrf_test', 'T');

        var all_pay_to = getAllowancePayToByBuyingAgent(poJsonObj.custbodysourcing_agent);
        if (isValid(all_pay_to)) {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_all_pay_to', all_pay_to);
        }


        if (poJsonObj.hasOwnProperty('custbodyroyalty_charges_perc') && isValid(poJsonObj.custbodyroyalty_charges_perc)) {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_all_percentage', parseFloat(poJsonObj.custbodyroyalty_charges_perc));
        }


        if (poJsonObj.custbodyroyalty_holder === 'Applause Source, LLC') {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_add_charge_percent', poJsonObj.custbodyroyalty_charges_perc);
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts2_bpol_royalty_licensor', 6);
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_add_charge_pay_to', 7420);
        }

        if (htsCodeObj) {
            ts2BlanketPoLineRec.setFieldValue('custrecord_ts_bpol_hts_code', htsCodeObj.id);
        }


        var ts2BlanketPoLineId = nlapiSubmitRecord(ts2BlanketPoLineRec, true, true);
        nlapiLogExecution('DEBUG', 'Blanket PO', ts2BlanketPoId);
        nlapiLogExecution('DEBUG', 'Blanket PO Line ' + (bpoLine ? 'Updated' : 'Created'), ts2BlanketPoLineId);

        if (ts2BlanketPoLineId) {
            if (bpolPriceMap) {
                bpolPriceMap[p] = ts2BlanketPoLineId;
            }
            if (bpolPriceArr) {
                bpolPriceArr.push(ts2BlanketPoLineId);
            }
        }


        idx++;


    }

    return {
        bpolPriceMap: bpolPriceMap,
        bpolPriceArr: bpolPriceArr
    }


}

function getAllowancePayToByBuyingAgent(name) {

    if (isValid(name)) {
        var exception = 'Sourceco International Enterprise Co., Ltd.';

        if (name === exception) {
            name = name + ' - Royalty (TS)';
        }

        var result = nlapiSearchRecord('vendor', null,
            [new nlobjSearchFilter('entityid', null, 'is', name)],
            [new nlobjSearchColumn('entityid')]);

        if (isValid(result) && result.length > 0) {
            return result[0].id;
        }

        return null;
    }
    return null;

}