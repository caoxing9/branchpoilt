use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition,
};

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .tooltip("BranchPilot")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        // Position window below the tray icon, centered horizontally
                        let window_width = 420.0_f64;
                        let x = position.x - window_width / 2.0;
                        let y = position.y;
                        let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
