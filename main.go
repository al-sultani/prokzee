package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application menu
	appMenu := menu.NewMenu()

	// Create main menu
	mainMenu := appMenu.AddSubmenu("Menu")
	mainMenu.AddText("About", nil, func(_ *menu.CallbackData) {
		runtime.MessageDialog(app.ctx, runtime.MessageDialogOptions{
			Title:   "About ProKZee",
			Message: "ProKZee is a proxy tool that allows you to intercept and analyze HTTP/HTTPS trafic.",
			Type:    runtime.InfoDialog,
		})
	})
	mainMenu.AddText("Refresh", keys.CmdOrCtrl("r"), func(_ *menu.CallbackData) {
		runtime.WindowExecJS(app.ctx, `
			window.location.href = '/';
			setTimeout(() => {
				window.location.reload();
			}, 100);
		`)
	})

	// Add standard Edit menu with clipboard operations
	appMenu.Append(menu.EditMenu())

	// Create application with options
	err := wails.Run(&options.App{
		Title:            "ProKZee",
		Width:            1024,
		Height:           768,
		WindowStartState: options.Maximised,
		Fullscreen:       false,
		Debug: options.Debug{
			OpenInspectorOnStartup: false,
		},
		Menu: appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        app.startup,
		// OnStartup: func(ctx context.Context) {
		// 	cwd, _ := os.Getwd()
		// 	runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		// 		Title:   "Debug Info",
		// 		Message: "CWD: " + cwd,
		// 	})
		// },
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
