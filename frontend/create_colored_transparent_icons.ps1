Add-Type -AssemblyName System.Drawing

$srcPath = "d:\sharing\xpharma\frontend\assets\images\frame-42.png"
$srcBmp = New-Object System.Drawing.Bitmap $srcPath

$minX = $srcBmp.Width
$maxX = 0
$minY = $srcBmp.Height
$maxY = 0

# 1. Scan bounding box of non-white pixels
for ($y = 0; $y -lt $srcBmp.Height; $y++) {
    for ($x = 0; $x -lt $srcBmp.Width; $x++) {
        $pixel = $srcBmp.GetPixel($x, $y)
        $isWhite = ($pixel.R -gt 245 -and $pixel.G -gt 245 -and $pixel.B -gt 245)
        $isTransparent = ($pixel.A -lt 20)
        if (-not $isWhite -and -not $isTransparent) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$logoWidth = $maxX - $minX + 1
$logoHeight = $maxY - $minY + 1

# 2. Extract full-colored logo with 100% transparent background (removing the white background completely)
$coloredTransparent = New-Object System.Drawing.Bitmap $logoWidth, $logoHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $logoHeight; $y++) {
    for ($x = 0; $x -lt $logoWidth; $x++) {
        $pixel = $srcBmp.GetPixel($minX + $x, $minY + $y)
        $isWhite = ($pixel.R -gt 245 -and $pixel.G -gt 245 -and $pixel.B -gt 245)
        $isTransparent = ($pixel.A -lt 20)
        if ($isWhite -or $isTransparent) {
            $coloredTransparent.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            # Keep the exact full original vibrant colors!
            $coloredTransparent.SetPixel($x, $y, $pixel)
        }
    }
}

function Save-FullColorTransparentIcon($cropped, $targetPath, $size, $paddingRatio, $addWhiteBg) {
    $outBmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($outBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($addWhiteBg) {
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $g.FillRectangle($brush, 0, 0, $size, $size)
        $brush.Dispose()
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    $targetLogoSize = [int]($size * (1.0 - $paddingRatio))
    $scale = [Math]::Min(($targetLogoSize / $cropped.Width), ($targetLogoSize / $cropped.Height))

    $finalW = [int]($cropped.Width * $scale)
    $finalH = [int]($cropped.Height * $scale)
    $destX = [int](($size - $finalW) / 2)
    $destY = [int](($size - $finalH) / 2)

    $g.DrawImage($cropped, $destX, $destY, $finalW, $finalH)

    $outBmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $outBmp.Dispose()
    Write-Output "Saved full color icon: $targetPath ($size x $size)"
}

# 1. Notification icon (Full color on 100% transparent background)
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\notification-icon.png" 96 0.10 $false

# 2. Splash icon (Full color on 100% transparent background)
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\splash-icon.png" 512 0.15 $false

# 3. Android adaptive icon foreground (Full color on 100% transparent background)
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\android-icon-foreground.png" 512 0.35 $false
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\android-icon-monochrome.png" 512 0.35 $false

# 4. App main icon (Full color on clean rounded/white background)
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\icon.png" 1024 0.25 $true

# 5. Expo placeholder logo
Save-FullColorTransparentIcon $coloredTransparent "d:\sharing\xpharma\frontend\assets\images\expo-logo.png" 512 0.15 $false

# 6. Copy to brain artifact so we can preview it
Save-FullColorTransparentIcon $coloredTransparent "C:\Users\Dell\.gemini\antigravity-ide\brain\a4a5abfc-1ff9-4cb0-ab0a-80ac7a9a9f7f\color_transparent_preview.png" 512 0.15 $false

$coloredTransparent.Dispose()
$srcBmp.Dispose()
