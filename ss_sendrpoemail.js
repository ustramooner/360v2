/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

 define(['N/email', 'N/record', 'N/log', 'N/search', 'N/runtime', 'N/file', 'N/format'], 
    function(email, record, log, search, runtime, file, format){

        function sendEmailWithAttachement(emailTemplateId, rpoId, attachedmentId) {

            var emailTemplate = record.load({
                type : 'emailtemplate',
                id : emailTemplateId
            });

            var rpo = getRPO(rpoId);

            var m = mergeMessage(emailTemplate, rpo);


            var fileObj = [];

            if(attachedmentId != null && attachedmentId != ""){
                 fileObj = [file.load({
                    id: attachedmentId
                })];                
            }
            var sender = getEmployeeEmail(rpo.getValue('custrecord_ts2_rlpo_order_owner'));

            if(rpo.getValue('custrecord_ts2_rlpo_other_attachment') != ''){
                fileObj.push(file.load({id: rpo.getValue('custrecord_ts2_rlpo_other_attachment')}));
            }
            
            var recipients = getContactEmail(rpo.getValue('custrecord_ts2_rlpo_vendor_ctc'));

            var cc = [];
            
            cc.push(sender.trim());

            if(recipients.altemail != null && recipients.altemail != ''){
               var alt = recipients.altemail.split(',');
                for(var i = 0; i < alt.length; i++){
                    if(alt[i].trim() != null && alt[i].trim() != ''){
                        cc.push(alt[i].trim());    
                    }
                }
            }
            

            var teamEmail = getTeamEmail(rpo.getValue('custrecord_ts2_rlpo_ts_team'));
            if(teamEmail.trim() != null && teamEmail.trim() != ''){
                cc.push(teamEmail.trim());
            }
            
            var ps1 = getEmployeeEmail(rpo.getValue('custrecord_ts2_rlpo_product_spec_1'));
            if(ps1.trim() != null && ps1.trim() != ''){
                cc.push(ps1.trim());
            }

            var ps2 = getEmployeeEmail(rpo.getValue('custrecord_ts2_rlpo_product_spec_2'));
            if(ps2.trim() != null && ps2.trim() != ''){
                cc.push(ps2.trim());
            }

            log.debug({title : 'CC', details : cc});
log.debug({title: 'Email Detail', details :'Sender: ' + rpo.getValue('custrecord_ts2_rlpo_order_owner') + ' Recipient: ' + recipients.email})

            email.send({
                author: rpo.getValue('custrecord_ts2_rlpo_order_owner'),
                recipients: recipients.email,
                cc : cc,
                subject: m.subject,
                body: m.body,
                attachments : fileObj,
                relatedRecords: {
                            customRecord:{
                              id: rpoId,
                              recordType: 'customrecord_ts2_rlpo' //an integer value
                              }
                      }
            });

            //updatePOSentDate(rpoId);
        }

        function updatePOSentDate(rpoId){
          record.submitFields({
               type: 'customrecord_ts2_rlpo',
               id: rpoId,
               values: {
                custrecord_ts2_rlpo_send_rl_date : getDateTime().toString()
               },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields : true
                }
            });
        }

        function getDateTime(){
            var d = new Date();
            var formattedDateString = format.parse({
                value: d,
                type: format.Type.DATETIMETZ
            });

            var formattedDateString2 = format.format({
                value: formattedDateString,
                type: format.Type.DATETIMETZ
            });

            return formattedDateString2;
        }

        function getTeamEmail(tsEmail){
            if(tsEmail == null || tsEmail == '') return '';
            var tsTeam = record.load({
                type : 'customrecord_ts_team_list',
                id : tsEmail
            });
            return tsTeam.getValue('custrecord_ts2_team_email');
        }

        function getEmployeeEmail(empId){
            if(empId == null || empId == '') return '';
            var employee = record.load({
                type : 'employee',
                id : empId
            });
            return employee.getValue('email');
        }

        function getContactEmail(contactId){
            if(contactId == null || contactId == '') return '';
            var contact = record.load({
                type : 'contact',
                id : contactId
            });
            return {email : contact.getValue('email'), altemail : contact.getValue('custentity_ts2_contact_atl_email_po_rl')}
        }

        function getRPO(Id){
            var result = search.create({
                    type: 'customrecord_ts2_rlpo',
                    filters: [
                                    {
                                        name: 'internalid',
                                        operator: 'is',
                                        values: Id
                                    }
                            ],
                    columns: [
                                    {
                                        name : 'custrecord_ts2_rlpo_vendor_ctc'
                                    },
                                    {
                                        name : 'name'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_status'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_order_owner'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_ts_team'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_product_spec_1'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_product_spec_2'
                                    },
                                    {
                                        name : 'custrecord_ts2_rlpo_other_attachment'
                                    }
                                ],
                    title: 'RPO'
            });

            var r = result.run().getRange({
                                    start: 0,
                                    end: 1000
                                });
            
            if(r.length > 0){
                return r[0];
            }else{
                return {getValue : function(id){return [];}};
            }
        }

        function mergeMessage(emailTemplate, rpo){

            var etsubject = emailTemplate.getValue('subject') || '';
            var etmessage = emailTemplate.getValue('content') || '';
            var subject = etsubject.replace(/(\$\{customrecord.name\})/i, rpo.getValue('name'));
            var content = etmessage.replace(/(\$\{customrecord.custrecord_ts2_rlpo_vendor_ctc\})/i, rpo.getText('custrecord_ts2_rlpo_vendor_ctc'));
            content = content.replace(/(\$\{customrecord.name\})/i, rpo.getValue('name'));
            
            return {subject : subject , body : content}
        }


        function execute(context){
log.debug({title:'Current Context', details : runtime.executionContext });
            var scriptObj = runtime.getCurrentScript();
            var emailTemplateId = scriptObj.getParameter({name: 'custscript_rpo_email_template'});
            var rpoId = scriptObj.getParameter({name : 'custscript_rpo_id'});
            var attachedmentId = scriptObj.getParameter({name : 'custscript_rpo_approval_fileId'});
            sendEmailWithAttachement(emailTemplateId, rpoId, attachedmentId);

        }
        return {
            execute : execute
        }
 });