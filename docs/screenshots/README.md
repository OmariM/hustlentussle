# UI Screenshots

This directory contains screenshots of the Hustle n' Tussle web interface for documentation purposes. To update these screenshots:

## How to Take Screenshots

1. Launch the application:
   ```bash
   python web/app.py
   ```

2. Access in browser:
   Open http://localhost:5000 in your browser

3. Take screenshots of the following screens:
   - `setup-screen.png`: The initial setup page with name input fields
   - `voting-screen.gif`: Animated capture of the voting interface during a round (matchups, scores, voting options)
   - `results-screen.png`: The final results page showing leaderboards with medals and crown emojis
   - Optional: Home screen with Start Battle and Upload Results

4. Tips for better captures:
   - Use resolution around 1200x800
   - Toggle Theme to match your site style (light/dark)
   - You can enable debug tools for quick state setup via `?debug=1` or Alt+Shift+D (for internal/demo use)
   - Optimize file size for web (PNG for static, GIF or MP4 for animations)

## Sample Data for Screenshots

For consistency in documentation, use the following sample data:

**Lead Names**:
```
John, Michael, David, James, Robert
```

**Follow Names**:
```
Emma, Olivia, Sophia, Isabella, Ava
```

**Judge Names**:
```
Alex, Jordan, Sam
```

This will create a manageable competition size with enough participants to demonstrate the crown emoji and other UI features. 