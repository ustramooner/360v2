/**
* @NApiversion 2.x
* @NScriptType ClientScript
*/

require(['N/sftp', 'N/file'],	
	function(sftp, file){

		function uploadFile(){

			var myuser = "editest";
			var myPwdGuid = "apple123";
	        var myHostKey = "sftp.threesixtysourcing.com";

	        var connection = sftp.createConnection({
	            username: myuser,
	            passwordGuid: myPwdGuid,
	            url: 'host.somewhere.com',
	            directory: '/',
	            hostKey: myHostKey
	        });

	        var myFileToUpload = file.create({
	            name: 'originalname.js',
	            fileType: file.fileType.PLAINTEXT,
	            contents: 'I am a test file. Hear me roar.'
	        });

	        connection.upload({
	            directory: 'relative/path/to/remote/dir',
	            filename: 'newFileNameOnServer.js',
	            file: myFileToUpload,
	            replaceExisting: true
	        });

	        var downloadedFile = connection.download({
	            directory: 'relative/path/to/file',
	            filename: 'downloadMe.js'
	        });

		}

		return {
			uploadFile : uploadFile
		};

});