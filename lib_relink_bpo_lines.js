function removeLines(bpoLines, bpolPriceMap){
  var newLines = [];
    for(var i = 0; i < bpoLines.length; i++){
        if(!existsInMapping(bpoLines[i].rate, bpolPriceMap)){
            newLines.push(bpoLines[i]);
        }
    }
    return newLines;  
  //return bpoLines.filter( line => !existsInMapping(line.rate, bpolPriceMap) );
}

function existsInMapping(rate, bpolPriceMap){
    for(var keyRate in bpolPriceMap){
        if(keyRate === rate){
          nlapiLogExecution('AUDIT', 'exists in mapping', keyRate);
            return true;
        }
    }
    return false;
}

function relinkBPOLines(bpoLines, bpolPriceMap){
    nlapiLogExecution('DEBUG', 'Checking bpolPriceMap', bpolPriceMap);
    for(var rate in bpolPriceMap){

        var newBpolId = bpolPriceMap[rate];
        
        nlapiLogExecution('DEBUG', 'BPO Line Rate', rate);
        nlapiLogExecution('DEBUG', 'BPO Line New', newBpolId);

        var oldBpoline = getBpoline(bpoLines, rate);
        nlapiLogExecution('DEBUG', 'Old BPO Line', oldBpoline);
        if(oldBpoline){
            var bpoline = {
                bpolId : oldBpoline,
                newBpolId : newBpolId
            };
          try{
          //PG change 20180121
            relinkReleaseLines(bpoline);
            relinkQATest(bpoline);
            relinkQAJobOrder(bpoline);
            relinkIRFLine(bpoline);
            relinkInspectionResultLine(bpoline);
            relinkASNLines(bpoline);
            relinkPenaltyAndBillableCharge(bpoline);
        }catch(ex){
          nlapiLogExecution('ERROR', 'Error on relinking ' + oldBpoline + ' to ' + newBpolId, ex.message);
        }
          }

    }
    /*for(var i = 0; i < bpoLines.length; i++){

        var rate = bpoLines[i].rate;
        var bpolId = bpolPriceMap[rate];

        if(bpolId){
            var bpoline = {
                bpolId : bpoLines[i].bpolId,
                newBpolId : bpolId
            };
            relinkASNLines(bpoline);
            relinkReleaseLines(bpoline);
            relinkIRFLine(bpoline);
            relinkPenaltyAndBillableCharge(bpoline);
            relinkQATest(bpoline);
            relinkQAJobOrder(bpoline);
            relinkInspectionResultLine(bpoline);
        }

    }*/

}

function getBpoline(bpoLines, rate){
    var id = null;
    bpoLines.forEach(function(bpoline){
       if(bpoline.rate === rate){
              nlapiLogExecution('DEBUG', 'BPO Line Rate vs rate', bpoline.rate + ' vs ' + rate);
         id = bpoline.bpolId;
       }
       return true;
    });
    return id;
}

function relinkASNLines(bpoline){
    relink(bpoline, 'customrecord_ts_asn_item_details', 'custrecord_ts_asn_bpol_no');
}

function relinkReleaseLines(bpoline){
    relink(bpoline, 'purchaseorder', 'custbody_ts2_rspol_bpol_no');
}

function relinkIRFLine(bpoline){
    relink(bpoline, 'customrecord_ts2_irfl', 'custrecord_ts2_irfl_bpol_no');
}

function relinkPenaltyAndBillableCharge(bpoline){
    relink(bpoline, 'customrecord_ts2_pbc', 'custrecord_ts2_pbc_bpol_no');
}

function relinkQATest(bpoline){
    relink(bpoline, 'customrecord_ts2_qaresult', 'custrecord_ts2_qar_bpol');
}

function relinkQAJobOrder(bpoline){
    relink(bpoline, 'customrecord_ts2_qa_lab_chinese_add', 'custrecord_ts2_qa_bpol');
}

function relinkInspectionResultLine(bpoline){
    relink(bpoline, 'customrecord_ts2_irl', 'custrecord_ts2_ril_related_bpol');
}

function relink(bpoline, recordType, fieldId){

    var filters = [];
    filters.push(new nlobjSearchFilter(fieldId, null, 'is', bpoline.bpolId));
if(recordType === 'purchaseorder'){
    filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
}
    var result = nlapiSearchRecord(recordType, null, filters) || [];
    nlapiLogExecution('DEBUG', 'Relinking to records', recordType + ' ' + fieldId + ' = ' + result.length);
    for(var i = 0; i < result.length; i++){
              nlapiLogExecution('DEBUG', 'Relinking', 'Record Type: ' + recordType + ' with id: ' + result[i].id + ' and field: ' + fieldId + ' replace with: ' + bpoline.newBpolId);
        //nlapiSubmitField(recordType, result[i].id, fieldId, bpoline.newBpolId);
            updateRecord(recordType, result[i].id, fieldId, bpoline.newBpolId);
    }

}

function updateRecord(type, id, field, value){
    var rec = nlapiLoadRecord(type, id);
    rec.setFieldValue(field, value);
    nlapiSubmitRecord(rec, false, true);
}
