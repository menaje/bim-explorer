const DECODER_ID = "meshoptimizer";
const DECODER_VERSION = "1.2.0";

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

let capabilityPromise = null;

export async function loadMeshoptDecoder({ signal } = {}) {
  aborted(signal);
  capabilityPromise ??= import("meshoptimizer/decoder")
    .then(async ({ MeshoptDecoder }) => {
      if (
        MeshoptDecoder?.supported !== true ||
        !(MeshoptDecoder.ready instanceof Promise)
      ) {
        throw new DOMException(
          "meshoptimizer WebAssembly decoder is unsupported",
          "NotSupportedError",
        );
      }
      await MeshoptDecoder.ready;
      return Object.freeze({
        id: DECODER_ID,
        version: DECODER_VERSION,
        runtime: "embedded-wasm-single-thread",
        supported: true,
        decodeGltfBuffer(
          target,
          count,
          stride,
          source,
          mode,
          filter,
        ) {
          MeshoptDecoder.decodeGltfBuffer(
            target,
            count,
            stride,
            source,
            mode,
            filter,
          );
        },
      });
    });
  const capability = await capabilityPromise;
  aborted(signal);
  return capability;
}
