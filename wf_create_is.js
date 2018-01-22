/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */
define(['N/file', 'N/log', 'N/redirect','../src/lib/obj_build_IS_Printout'
    ],
    function(file, log, redirect, ISPrintout) {

        var OFFICIAL_PRINT = false;

        

        function onAction(context) {

            var InspectionSchedule = context.newRecord;

            var pdfFileId = ISPrintout.buildISPDF(InspectionSchedule);
            
            log.debug('IS Name', InspectionSchedule.getValue('name'));
            
            if (pdfFileId) {
                var pdfFile = file.load({
                    id: pdfFileId
                });
                //context.response.writeFile(pdfFile, false);
                redirect.toSuitelet({
                    scriptId: 'customscript_ss_printout',
                    deploymentId: 1,
                    parameters: {
                        'custpdf_fileid': pdfFileId
                    }
                });
            }

        }

        


        return {
            onAction: onAction
        }

    });