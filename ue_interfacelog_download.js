/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/ui/serverWidget','N/log', 'N/url'],function(serverWidget, log, url){

    function beforeLoad(context){

        if(context.type == context.UserEventType.VIEW){

            var interfaceLog = context.newRecord;
            if(interfaceLog){
                var output = url.resolveScript({
                    scriptId : 'customscript_sl_interface_log_report',
                    deploymentId : 'customdeploy_sl_interface_log_report',
                    params : {
                        custscript_sl_interface_log_id : interfaceLog.id
                    }
                });

                log.debug('Before Load', output);

                var form = context.form;

                form.addButton({
                    id: 'custpage_print_is_pdf_x',
                    label: 'Generate Comparison Report',
                    functionName: 'window.open("' + output + '");'
                });
                log.debug('form button', 'Added');
            }
        }

    }

    return {
        beforeLoad : beforeLoad
    }
});