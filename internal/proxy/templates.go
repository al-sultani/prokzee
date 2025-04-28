package proxy

const CertificateDownloadPage = `<!DOCTYPE html>
<html>
<head>
    <title>Prokzee Root CA Certificate</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1000px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
            background: #f9f9f9;
        }
        .container {
            background: #fff;
            border-radius: 12px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #eee;
            padding-bottom: 15px;
            text-align: center;
        }
        h2 {
            color: #2c3e50;
            margin-top: 30px;
        }
        h3 {
            color: #34495e;
            margin-top: 25px;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        .download-btn {
            display: inline-block;
            background: #4CAF50;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: bold;
            transition: background 0.3s;
        }
        .download-btn:hover {
            background: #45a049;
        }
        .instructions {
            background: #fff;
            padding: 25px;
            border-left: 4px solid #4CAF50;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .logo {
            display: block;
            margin: 0 auto 20px;
            width: 120px;
            height: 120px;
        }
        .logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        code {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            display: block;
            margin: 10px 0;
            font-family: 'Monaco', 'Consolas', monospace;
            overflow-x: auto;
        }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .os-selector {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 20px 0;
        }
        .os-btn {
            padding: 10px 20px;
            border: 2px solid #4CAF50;
            border-radius: 6px;
            cursor: pointer;
            background: white;
            color: #4CAF50;
            font-weight: bold;
            transition: all 0.3s;
        }
        .os-btn:hover, .os-btn.active {
            background: #4CAF50;
            color: white;
        }
        .os-instructions {
            display: none;
        }
        .os-instructions.active {
            display: block;
        }
    </style>
</head>
<body>
    <h1>Prokzee Root CA Certificate</h1>
    <div class="container">
        <p>To use Prokzee for HTTPS inspection, you need to install and trust our Root CA Certificate. Follow the instructions below for your operating system after downloading the certificate.</p>
        <div style="text-align: center;">
            <a href="/rootCA.pem" class="download-btn">Download Root CA Certificate</a>
            <div style="margin-top: 15px; font-size: 14px;">
                For Windows users: <a href="/rootCA.crt" style="color: #4CAF50; font-weight: bold;">Download .CRT Format</a> | 
                <a href="/rootCA.cer" style="color: #4CAF50; font-weight: bold;">Download .CER Format</a>
            </div>
        </div>
        <div class="warning">
            <strong>Security Notice:</strong> Only install this certificate if you trust ProKZee and understand the security implications. This certificate will allow Prokzee to inspect HTTPS traffic on your device.
        </div>
    </div>
    
    <div class="instructions">
        <h2>Installation Instructions</h2>
        <div class="os-selector">
            <button class="os-btn active" onclick="showOS('windows')">Windows</button>
            <button class="os-btn" onclick="showOS('macos')">macOS</button>
            <button class="os-btn" onclick="showOS('linux')">Linux</button>
            <button class="os-btn" onclick="showOS('mobile')">Mobile</button>
            <button class="os-btn" onclick="showOS('browsers')">Browsers</button>
        </div>

        <div id="windows" class="os-instructions active">
            <h3>Windows</h3>
            <ol>
                <li>Double-click the downloaded certificate file (.crt or .cer file recommended for Windows)</li>
                <li>Click "Install Certificate"</li>
                <li>Select "Local Machine" and click Next</li>
                <li>Choose "Place all certificates in the following store"</li>
                <li>Click "Browse" and select "Trusted Root Certification Authorities"</li>
                <li>Click "Next" and then "Finish"</li>
                <li>Confirm the security warning by clicking "Yes"</li>
                <li>Restart your browsers</li>
            </ol>
        </div>

        <div id="macos" class="os-instructions">
            <h3>macOS</h3>
            <ol>
                <li>Open Terminal</li>
                <li>Navigate to the directory containing the downloaded certificate</li>
                <li>Run the following command:</li>
                <code>sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain rootCA.pem</code>
                <li>Enter your administrator password when prompted</li>
                <li>Open Keychain Access and verify the certificate is in the System Keychain</li>
                <li>Double-click the certificate and expand "Trust"</li>
                <li>Set "When using this certificate" to "Always Trust"</li>
                <li>Close the certificate window and enter your password to save changes</li>
                <li>Restart your browsers</li>
            </ol>
        </div>

        <div id="linux" class="os-instructions">
            <h3>Linux (Ubuntu/Debian)</h3>
            <ol>
                <li>Open Terminal</li>
                <li>Copy the certificate to the trusted store:</li>
                <code>sudo cp rootCA.pem /usr/local/share/ca-certificates/prokzee.crt</code>
                <li>Update the certificate store:</li>
                <code>sudo update-ca-certificates</code>
                <li>Restart your browsers</li>
            </ol>

            <h3>Linux (CentOS/RHEL)</h3>
            <ol>
                <li>Open Terminal</li>
                <li>Copy the certificate to the trusted store:</li>
                <code>sudo cp rootCA.pem /etc/pki/ca-trust/source/anchors/prokzee.pem</code>
                <li>Update the certificate store:</li>
                <code>sudo update-ca-trust extract</code>
                <li>Restart your browsers</li>
            </ol>
        </div>

        <div id="mobile" class="os-instructions">
            <h3>iOS</h3>
            <ol>
                <li>Download the certificate on your iOS device</li>
                <li>Go to Settings</li>
                <li>You should see a "Profile Downloaded" option near the top</li>
                <li>Tap it and follow the installation prompts</li>
                <li>Go to Settings > General > About > Certificate Trust Settings</li>
                <li>Enable full trust for the Prokzee root certificate</li>
            </ol>

            <h3>Android</h3>
            <ol>
                <li>Download the certificate on your Android device</li>
                <li>Go to Settings > Security > Advanced > Encryption & Credentials</li>
                <li>Tap "Install a certificate" > "CA Certificate"</li>
                <li>Locate and select the downloaded certificate</li>
                <li>Follow the prompts to install</li>
                <li>Note: On Android 14+, you may need to use browser-specific certificate settings</li>
            </ol>
        </div>

        <div id="browsers" class="os-instructions">
            <h3>Firefox (All OS)</h3>
            <ol>
                <li>Open Firefox</li>
                <li>Go to Settings/Preferences > Privacy & Security > Certificates</li>
                <li>Click "View Certificates"</li>
                <li>Go to the "Authorities" tab</li>
                <li>Click "Import" and select the downloaded certificate</li>
                <li>Check "Trust this CA to identify websites" and click OK</li>
            </ol>

            <h3>Chrome/Edge/Safari</h3>
            <p>These browsers use the system's certificate store. Install the certificate for your operating system as described above.</p>
        </div>
    </div>

    <script>
        function showOS(os) {
            // Hide all instructions
            document.querySelectorAll('.os-instructions').forEach(el => {
                el.classList.remove('active');
            });
            // Show selected OS instructions
            document.getElementById(os).classList.add('active');
            // Update button states
            document.querySelectorAll('.os-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector('button[onclick*="' + os + '"]').classList.add('active');
        }
    </script>
</body>
</html>`

// ErrorResponseTemplate is the HTML template used for error responses
const ErrorResponseTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ProKZee</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
            color: #333;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            padding: 30px;
            max-width: 600px;
            width: 300px;
            text-align: center;
        }
        .logo {
            display: block;
            margin: 0 auto 20px;
            width: 100px;
            height: 100px;
        }
        .logo img {
            object-fit: contain;
        }
        .message {
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 30px;
            color: #555;
            font-weight: 500;
        }
        .url {
            font-size: 14px;
            color: #777;
            word-break: break-all;
            margin-top: 20px;
            padding: 10px;
            background-color: #f5f5f5;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>ProKZee</h1>
        <div class="message">%s</div>
        <div class="url">%s</div>
    </div>
</body>
</html>`
