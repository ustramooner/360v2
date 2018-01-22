/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/redirect'],
    function(redirect) {
        function onAction(context) {            
            var newRecord = context.newRecord;
            redirect.toRecord({
                    type: 'customrecord_ts_asn_item_details',
                    id: newRecord.id,
                    isEditMode: true
                });
        }
        return {
            onAction: onAction
        }
    });