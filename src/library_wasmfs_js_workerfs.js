addToLibrary({
  // JSFile backend: Store a file's data in JS. We map File objects in C++ to
  // entries here that contain typed arrays.
  $wasmFS$JSMemoryFiles: {},

  _wasmfs_create_js_workerfs_backend_js__deps: [
    '$wasmFS$backends',
    '$wasmFS$JSMemoryFiles',
  ],
  _wasmfs_create_js_workerfs_backend_js: (backend) => {
    wasmFS$backends[backend] = {
      allocFile: (file) => {
        // Do nothing
      },
      freeFile: (file) => {
        // DO nothing 
      },
      write: (file, buffer, length, offset) => {
        return length;
      },
      read: (file, buffer, length, offset) => {
        var currentFile = new File(["test file from wasmfs workerfs backend"], "test.txt", {
          type: "text/plain",
        });

        // should only work in web worker
        var fileReaderSync = new FileReaderSync(); 
        var fileDataArrayBuffer =  fileReaderSync.readAsArrayBuffer(currentFile);
        var fileData = new Uint8Array(fileDataArrayBuffer);

        // We can't read past the end of the file's data.
        var dataAfterOffset = Math.max(0, fileData.length - offset);
        // We only read as much as we were asked.
        length = Math.min(length, dataAfterOffset);
        HEAPU8.set(fileData.subarray(offset, offset + length), buffer);
        return length;
      },
      getSize: (file) => {
        var currentFile = new File(["test file from wasmfs workerfs backend"], "test.txt", {
          type: "text/plain",
        });
        return currentFile.size;
      },
    };
  },
});
