/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */
define(['N/file', 'N/sftp', 'N/log', 'N/runtime', 'N/search', 'N/record', 'N/task', 'N/format', '../src/lib/gen_scripts'], function(file, sftp, log, runtime, search, record, task, format, genScripts) {


    function getFilesForUpload() {
        var result = search.create({
            type: 'customrecord_ts2_asn_file_upload',
            columns: ['custrecord_ts2_asn_fileid', 'custrecord_ts2_asn_no'],
            title: 'Searching for Files'
        });

        var resultSet = result.run().getRange(0, 1000);
        log.debug('Files to upload', resultSet.length);
        if (resultSet.length > 0) {
            return resultSet;
        }
        return [];
    }

    function execute(context) {

        var files = getFilesForUpload();


        do {

            log.debug('Start Uploading files', files.length);
            var scriptObj = runtime.getCurrentScript();
            var remainingUsage = scriptObj.getRemainingUsage();

            log.debug('Remaining Usage', remainingUsage);

            if (remainingUsage > 500) {

                uploadFile(files, scriptObj);
                files = getFilesForUpload();

            } else {

                var scriptId = 'customscript_upload_asn_xml';

                var mrTask = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    scriptId: scriptId,
                    deploymentId: 1
                });

                var mrTaskId = mrTask.submit();
                log.debug('Reached Usage Limie', remainingUsage);
                return;

            }
            log.debug('Files to upload', files.length);
        } while (files.length > 0)


        log.debug('End Uploading files', '----');

    }


    function uploadFile(files, scriptObj) {
        var myPwdGuid = "55a3078c068a403c9551b5a84a6b3a1c";
        var myHostKey = "AAAAB3NzaC1yc2EAAAABIwAAAIEAyPL1MR2p8KQa8iA5lnPhSr44HvpXWM4Qez3MAnj8yu8v0pI/9y1DzKDbwKYUggKKyHRd16iHY2Qem82H35oKBdkVXJCrsNKzlFY5trivxXX1lJ32VMGHLTsCKlcbHBNzaRIixIupy4L1shbeizdcK5MMzQ7x0nBanzmXozZicPE=";

        var scriptObj = runtime.getCurrentScript();



        for (var i = 0; i < files.length; i++) {

            var fileId = files[i].getValue('custrecord_ts2_asn_fileid'); //scriptObj.getParameter({name: 'custscript_xml_file_id'});

            log.debug({
                title: 'Connect Status',
                details: 'Connecting...'
            });

            var connection = sftp.createConnection({
                username: 'editest',
                passwordGuid: myPwdGuid,
                url: '101.78.137.117',
                port: 22,
                hostKey: myHostKey
            });

            log.debug({
                title: 'Connect Status',
                details: 'Connected'
            });

            log.debug({
                title: 'Loading File',
                details: 'loading ' + fileId + '...'
            });

            var asnRecord = file.load({
                id: fileId
            });

            log.debug({
                title: 'Loading File',
                details: 'loaded: ' + fileId
            });

            log.debug({
                title: 'Uploading File',
                details: 'Uploading ' + asnRecord.name + '...'
            });


            connection.upload({
                directory: '/asn_xml/',
                filename: asnRecord.name,
                file: asnRecord,
                replaceExisting: true
            });

            log.debug({
                title: 'Uploading File',
                details: 'Uploaded'
            });

            record.submitFields({
                type: 'customrecord_ts_asn',
                id: files[i].getValue('custrecord_ts2_asn_no'),
                values: {
                    custrecord_asn_isf_submit_dd: genScripts.formatDateTime(genScripts.getCurrentDate())
                }
            })
            record.delete({
                type: 'customrecord_ts2_asn_file_upload',
                id: files[i].id
            });



            var remainingUsage = scriptObj.getRemainingUsage();

            log.debug('Remaining Usage', remainingUsage);

            if (remainingUsage < 500) {

                break;

            }


        }
    }

    return {
        execute: execute
    }

});