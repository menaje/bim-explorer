# LAS/LAZ point renderer probe

Qualification-only Browser surface for the source-neutral bounded point range.
The loopback server derives one interleaved position/RGBA8 range from the
cache-only LAS records whose exact parity with the paired LAZ decode is already
qualified. Actual Chrome WebGL2 must upload the relative Float32 positions,
draw one `POINTS` primitive, produce non-background pixels and release every
renderer-owned resource.

This surface does not open LAS or LAZ in a product. It does not bundle the
sample or `laz-perf`, establish CRS/datum authority, expose point picking or
admit a point-cloud format.
