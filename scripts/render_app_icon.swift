// Renders the 1024 px Roots Local app icon. Usage: swift scripts/render_app_icon.swift out.png
// Then: npx tauri icon out.png -o <dir> and copy icon.icns and icon.png into src-tauri/icons.
import AppKit
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
ctx.clear(CGRect(x: 0, y: 0, width: size, height: size))
// macOS icon grid: 824 pt body centered, ~185 pt corner radius, soft shadow
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let path = CGPath(roundedRect: body, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: NSColor(white: 0, alpha: 0.28).cgColor)
ctx.addPath(path); ctx.setFillColor(NSColor.black.cgColor); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(path); ctx.clip()
let colors = [NSColor(srgbRed: 0x2f/255, green: 0x9a/255, blue: 0x81/255, alpha: 1).cgColor,
              NSColor(srgbRed: 0x14/255, green: 0x52/255, blue: 0x45/255, alpha: 1).cgColor] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])
ctx.restoreGState()
// Nucleus mark on a 100-unit grid mapped to the body (scale 5.6, origin 232)
let scale: CGFloat = 5.6, origin: CGFloat = 232
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: origin + x * scale, y: CGFloat(size) - (origin + y * scale)) }
ctx.setStrokeColor(NSColor.white.cgColor)
ctx.setLineWidth(10 * scale)
let c = p(50, 50)
ctx.strokeEllipse(in: CGRect(x: c.x - 34 * scale, y: c.y - 34 * scale, width: 68 * scale, height: 68 * scale))
ctx.setFillColor(NSColor.white.cgColor)
let d = p(58, 58)
ctx.fillEllipse(in: CGRect(x: d.x - 11 * scale, y: d.y - 11 * scale, width: 22 * scale, height: 22 * scale))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
