document.addEventListener('DOMContentLoaded', () => {
    // --- Existing Variable Declarations ---
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const uploadLabel = document.getElementById('upload-label');
    const statusMessage = document.getElementById('status-message');
    const resultArea = document.getElementById('result-area');
    // Remove individual size spans - no longer used in this version
    // const originalSizeSpan = document.getElementById('original-size');
    // const newSizeSpan = document.getElementById('new-size');
    // const savingsSpan = document.getElementById('savings');
    const resultSummary = document.getElementById('result-summary'); // Added for potential summary
    const downloadLink = document.getElementById('download-link');
    const resetButton = document.getElementById('reset-button');

    const WEBP_QUALITY = 0.8; // Adjust quality (0.0 to 1.0)
    const MAX_FILES = 20; // Maximum number of files allowed

    // Keep track of the current Object URL for the ZIP file
    let currentZipObjectURL = null;

    // --- Drag and Drop Handling (No Changes Needed) ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('highlight-drag'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('highlight-drag'), false);
    });
    uploadArea.addEventListener('drop', handleDrop, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFiles(files);
        }
    }

    // --- File Input Handling (No Changes Needed) ---
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    // --- Reset Button (Needs slight modification) ---
    resetButton.addEventListener('click', resetApp);

    // --- Core Logic (Major Updates) ---
    function handleFiles(files) {
        resetApp(); // Reset previous state first

        if (files.length === 0) {
            return; // No files selected
        }

        if (files.length > MAX_FILES) {
            showError(`Error: Too many files selected. Maximum is ${MAX_FILES}.`);
            return;
        }

        statusMessage.textContent = `Preparing to process ${files.length} file(s)...`;
        statusMessage.className = ''; // Reset status style
        uploadArea.hidden = true;
        resultArea.hidden = true;

        const processingPromises = [];
        const validFiles = []; // Keep track of files that pass initial validation

        // --- Initial Validation Loop ---
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
             if (!file.type.startsWith('image/')) {
                console.warn(`Skipping non-image file: ${file.name}`);
                continue; // Skip non-image files
            }
            // Optional: Add size check per file if needed
            // if (file.size > 20 * 1024 * 1024) { ... }
            validFiles.push(file);
        }

        if (validFiles.length === 0) {
            showError('Error: No valid image files found.');
            resetApp(); // Reset fully if no valid files
            return;
        }

        // --- Processing Loop ---
        validFiles.forEach((file, index) => {
            processingPromises.push(
                new Promise((resolve, reject) => {
                    updateStatus(`Processing ${index + 1} of ${validFiles.length}: ${file.name}`);
                    const reader = new FileReader();

                    reader.onload = function(event) {
                        const img = new Image();
                        img.onload = function() {
                            // Process this single image
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                            canvas.toBlob(function(blob) {
                                if (!blob) {
                                    console.error(`Failed to convert ${file.name} to WebP.`);
                                    reject(new Error(`Conversion failed for ${file.name}`));
                                    return;
                                }
                                const originalNameWithoutExt = file.name.split('.').slice(0, -1).join('.') || file.name;
                                const webpFilename = `${originalNameWithoutExt}.webp`;
                                resolve({ name: webpFilename, blob: blob, originalSize: file.size }); // Pass original size too
                            }, 'image/webp', WEBP_QUALITY);
                        };
                        img.onerror = function() {
                            console.error(`Could not load image: ${file.name}`);
                            reject(new Error(`Load failed for ${file.name}`));
                        };
                        img.src = event.target.result;
                    };
                    reader.onerror = function() {
                         console.error(`Could not read file: ${file.name}`);
                         reject(new Error(`Read failed for ${file.name}`));
                    };
                    reader.readAsDataURL(file);
                })
            );
        });

        // --- Wait for all promises ---
        Promise.all(processingPromises)
            .then(results => {
                // results is an array of { name: 'filename.webp', blob: Blob, originalSize: number }
                if (results.length === 0) {
                    showError("No images were successfully processed.");
                    resetApp();
                    return;
                }
                updateStatus(`Processed ${results.length} image(s). Creating ZIP file...`);
                createAndDownloadZip(results);
            })
            .catch(error => {
                showError(`An error occurred during processing: ${error.message}`);
                // Optionally, you could still try to zip the successfully processed ones
                // but for simplicity, we stop on the first error.
                resetApp(); // Reset on error
            });
    }

    function createAndDownloadZip(processedFiles) {
        const zip = new JSZip();
        let totalOriginalSize = 0;
        let totalOptimizedSize = 0;

        processedFiles.forEach(fileData => {
            zip.file(fileData.name, fileData.blob); // Add file to zip
            totalOriginalSize += fileData.originalSize;
            totalOptimizedSize += fileData.blob.size;
        });

        zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }) // level 6 is a balance
            .then(function(zipBlob) {
                // Clean up previous Object URL if it exists
                if (currentZipObjectURL) {
                    URL.revokeObjectURL(currentZipObjectURL);
                }

                currentZipObjectURL = URL.createObjectURL(zipBlob);
                downloadLink.href = currentZipObjectURL;
                downloadLink.download = 'shrinkray_optimized_images.zip'; // Set default ZIP filename

                // Calculate and display summary stats
                const totalSavings = totalOriginalSize > 0 ? ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) * 100 : 0;
                resultSummary.innerHTML = `
                    Processed ${processedFiles.length} images.<br>
                    Total Original Size: <span class="highlight">${formatBytes(totalOriginalSize)}</span><br>
                    Total Optimized Size: <span class="highlight">${formatBytes(totalOptimizedSize)}</span><br>
                    Total Space Saved: <span class="highlight-strong">${totalSavings.toFixed(1)}%</span>
                `;


                updateStatus('ZIP file ready for download!');
                resultArea.hidden = false; // Show results area
                uploadArea.hidden = true; // Keep upload hidden

                // Auto-revoke URL after click/download (add safety timeout)
                 downloadLink.addEventListener('click', () => {
                    setTimeout(() => {
                        if (currentZipObjectURL) {
                            URL.revokeObjectURL(currentZipObjectURL);
                            currentZipObjectURL = null; // Clear the reference
                         }
                    }, 1000); // Longer timeout for ZIP
                 }, { once: true });

            })
            .catch(err => {
                showError(`Error creating ZIP file: ${err.message}`);
                resetApp();
            });
    }


    function resetApp() {
        statusMessage.textContent = '';
        statusMessage.className = '';
        fileInput.value = ''; // Clear file input selection
        resultArea.hidden = true;
        uploadArea.hidden = false;
        resultSummary.textContent = ''; // Clear summary

        // Clean up any existing blob URL from download link
        if (currentZipObjectURL) {
            URL.revokeObjectURL(currentZipObjectURL);
            currentZipObjectURL = null;
        }
        downloadLink.removeAttribute('href');
        downloadLink.removeAttribute('download');
    }

    function updateStatus(message) {
        statusMessage.textContent = message;
        statusMessage.className = 'processing'; // Use green for progress
    }

    function showError(message) {
        statusMessage.textContent = message;
        statusMessage.className = 'error'; // Use pink for errors
         // Don't auto-reset on error in multi-file, let user click reset
    }

    // --- Utility Function (Unchanged) ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        // Handle potential edge case where bytes might be negative or non-numeric briefly
        if (isNaN(bytes) || bytes < 0) return 'Invalid Size';
        // Prevent log(0) or log(negative) errors
        if (bytes < 1) return bytes + ' Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        // Ensure 'i' is within the bounds of the 'sizes' array
        const index = Math.min(i, sizes.length - 1);
        return parseFloat((bytes / Math.pow(k, index)).toFixed(dm)) + ' ' + sizes[index];
    }


    // Initial state
    resetApp();
});