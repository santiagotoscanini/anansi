import { z } from 'zod'

// A camera overlay: a drawing the phone lays over its camera preview so a
// recurring picture (face, chest, side, back) is framed the same way every
// week. Strokes are polylines in coordinates normalized to the camera frame,
// [0,0] top-left to [1,1] bottom-right, so the drawing scales to any screen.
// `aspect` is the frame's width / height when it was drawn (3:4 portrait is
// 0.75), so a client can letterbox it instead of stretching it.
//
// Stored as jsonb on tracking_items.overlay and written by the phone app
// through /api/v1/tracking-items/{id}/overlay. Bounded so a runaway drawing
// can't turn into a megabyte row.

const MAX_POINTS = 20_000

const coordinate = z.number().min(0).max(1)

export const overlayStrokeSchema = z.object({
  points: z.array(z.tuple([coordinate, coordinate])).min(1).max(4000),
  /** Line width as a fraction of the frame's width. */
  width: z.number().min(0.001).max(0.1),
})

export const overlaySchema = z
  .object({
    version: z.literal(1),
    aspect: z.number().min(0.2).max(5),
    /** Which camera the outline was drawn for (selfie outlines are mirrored). */
    camera: z.enum(['front', 'back']).optional(),
    strokes: z.array(overlayStrokeSchema).max(300),
  })
  .refine((o) => o.strokes.reduce((n, s) => n + s.points.length, 0) <= MAX_POINTS, {
    message: `An overlay holds at most ${MAX_POINTS} points`,
  })

export type Overlay = z.infer<typeof overlaySchema>
