# `@bim-explorer/e57-point-source`

Experimental, read-only E57 1.0 point-source projection for BIM Explorer.
The initial profile accepts one bounded `data3D` scan with the default empty
codec vector, Cartesian XYZ records and either all three RGB records or no
color records. It verifies every physical page CRC-32C, the XML envelope,
compressed-vector section and packet bounds before deriving one source-neutral
`BEXPTS01` Float64-origin/relative-Float32/RGBA8 point range.

The decoder is product-owned JavaScript and runs inside the isolated point
Worker without WASM, dynamic code or network access. Its packet and BitPack
behavior was implemented with the MIT-licensed `cry-inc/e57@0.10.5` source as
an audit reference; the exact source identity and notice are recorded in the
repository third-party notices.

The source has no BIM semantic authority, native write or round-trip
authority. Coordinates remain `unqualified`: this package does not infer a
CRS, datum, scan pose or surveyed accuracy. Spherical coordinates, invalid
state filtering, extension records, images, multiple scans, point identity,
picking and LOD streaming are outside this initial profile.

Default bounds are 8 MiB source bytes, 500,000 records, 16 MiB decoded point
storage and one 8 MiB derived point range. Callers own and must clear source
and returned range buffers after transfer or renderer upload.

The pinned cache-only reference sample has passed actual Browser local-file,
staged VS Code Custom Editor and clean-installed VSIX product-open
qualification. That evidence admits only this bounded experimental product
profile; it does not admit the E57 format family or the source as a federation
coordinate authority.
