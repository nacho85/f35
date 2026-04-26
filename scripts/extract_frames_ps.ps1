# Extract frames from video using Windows Media Foundation via PowerShell
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

$videoPath = "C:\Users\nacho\OneDrive\Desktop\f14.mp4"
$outDir    = "C:\Users\nacho\OneDrive\Desktop"
$nFrames   = 8

$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([System.Uri]$videoPath)
$player.ScrubbingEnabled = $true
Start-Sleep -Milliseconds 2000

$duration = $player.NaturalDuration.TimeSpan.TotalSeconds
$width    = $player.NaturalVideoWidth
$height   = $player.NaturalVideoHeight
Write-Host "Duration: $duration s  Size: ${width}x${height}"

for ($i = 0; $i -lt $nFrames; $i++) {
    $t = $duration * $i / ($nFrames - 1)
    $player.Position = [TimeSpan]::FromSeconds($t)
    Start-Sleep -Milliseconds 500

    $bmp = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(
        $width, $height, 96, 96,
        [System.Windows.Media.PixelFormats]::Pbgra32)

    $dv = New-Object System.Windows.Media.DrawingVisual
    $dc = $dv.RenderOpen()
    $dc.DrawVideo($player, [System.Windows.Rect]::new(0, 0, $width, $height))
    $dc.Close()
    $bmp.Render($dv)

    $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bmp))

    $outPath = Join-Path $outDir "f14_frame_$($i.ToString('00')).png"
    $fs = [System.IO.File]::OpenWrite($outPath)
    $enc.Save($fs)
    $fs.Close()
    Write-Host "Saved frame $i at ${t}s -> $outPath"
}

$player.Close()
Write-Host "done"
