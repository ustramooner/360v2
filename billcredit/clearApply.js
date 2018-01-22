/*
* AUTHOR: Hunter MacLean
* DATE: July 20, 2016
* DESCRIPTION: During CSV import, if the Auto Apply box is changed from Checked to Unchecked then this script will uncheck the Apply box for all lines.
*/

function beforeSubmitClearApply(type){
  var currentContext = nlapiGetContext();
  nlapiLogExecution('DEBUG','Context', currentContext.getExecutionContext());
  if(currentContext.getExecutionContext() == 'csvimport' || currentContext.getExecutionContext() == 'csvimport'){
    var stErrMsg = '';
    var recType = nlapiGetRecordType();
    var recId = nlapiGetRecordId();
    var rec = nlapiLoadRecord(recType, recId);
    
    // Determine if Clear Apply checkbox is checked.
    var clearApply = rec.getFieldValue('custbody_ts_release_apply');
    nlapiLogExecution('DEBUG','Clear Apply', clearApply);

    try{
      // Only execute the code if Clear Apply checkbox is checked.
      if(clearApply == 'T'){
        var lines = rec.getLineItemCount('apply');
        nlapiLogExecution('DEBUG','Line Count', lines + ' lines');

        // Iterate through each line and uncheck the Apply box.
        for (var i = 1; i <= lines; i++){
          rec.setLineItemValue('apply', 'apply', i, 'F');
        }
      }
      else{
        nlapiLogExecution('DEBUG','Status', 'No need to clear Apply boxes');
      }

      // Uncheck the Clear Apply checkbox.
      rec.setFieldValue('custbody_ts_release_apply', 'F');
      nlapiSubmitRecord(rec);
    }
    // There was an error so report the details.
    catch(e){
      var stErrMsg = '';
  		if (e.getDetails !== undefined){
  			stErrMsg = 'Script Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
  		}
  		else{
  			stErrMsg = 'Script Error: ' + e.toString();
  		}
      nlapiLogExecution('DEBUG','Clear Apply Error', 'ERROR: ' + stErrMsg);
    }
  }
}