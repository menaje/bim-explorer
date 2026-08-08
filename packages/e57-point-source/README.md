# `@bim-explorer/e57-point-source`

Experimental, read-only E57 1.0 point-source projection for BIM Explorer.
The bounded profile accepts one `data3D` scan with the default empty codec
vector, Cartesian XYZ records and either all three RGB records or no color
records. Coordinate fields may be Float32, Float64, Integer or ScaledInteger
within the 53-bit integer bound. An optional integer
`cartesianInvalidState` field filters direction and invalid records before
bounds and point-range projection, and compressed-vector indexes may be
present or omitted. The decoder verifies every physical page CRC-32C, the XML
envelope, compressed-vector section, packet bounds and terminal bit padding
before deriving one source-neutral `BEXPTS01`
Float64-origin/relative-Float32/RGBA8 point range.

The decoder is product-owned JavaScript and runs inside the isolated point
Worker without WASM, dynamic code or network access. Its packet and BitPack
behavior was implemented with the MIT-licensed `cry-inc/e57@0.10.5` source as
an audit reference; the exact source identity and notice are recorded in the
repository third-party notices.

The source has no BIM semantic authority, native write or round-trip
authority. Coordinates remain `unqualified`: this package does not infer a
CRS, datum, scan pose or surveyed accuracy. Spherical coordinates, pose
application, extension records, images, multiple scans, point identity,
picking and LOD streaming remain outside this profile.

Default bounds are 8 MiB source bytes, 500,000 records, 16 MiB decoded point
storage and one 8 MiB derived point range. Callers own and must clear source
and returned range buffers after transfer or renderer upload.

The pinned cache-only colored-cube reference sample has passed actual Browser
local-file, staged VS Code Custom Editor and clean-installed VSIX product-open
qualification. Two additional cache-only bunny samples qualify Float64 and
ScaledInteger XYZ, optional Cartesian validity and an indexless
compressed-vector section against an independent `pye57/libE57Format`
position digest. Those samples are not redistributed and the reference decoder
is not a product dependency. The evidence admits only this bounded
experimental product profile; it does not admit the E57 format family or the
source as a federation coordinate authority.
