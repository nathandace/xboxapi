# Contributing to Xbox API

Thank you for your interest in contributing to Xbox API! This document provides guidelines for contributing to the project.

## 🤝 How to Contribute

### Reporting Issues

1. Check existing [issues](https://github.com/yourusername/XboxApi/issues) first
2. Create a detailed issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following our coding standards
4. Test your changes thoroughly
5. Commit with clear, descriptive messages
6. Push to your fork: `git push origin feature/amazing-feature`
7. Submit a pull request

## 🔧 Development Setup

1. **Prerequisites**
   - Node.js 16+ and npm
   - TypeScript knowledge recommended

2. **Local Development**
   ```bash
   git clone https://github.com/yourusername/XboxApi.git
   cd XboxApi
   npm install
   npm run dev
   ```

3. **Building**
   ```bash
   npm run build
   npm start
   ```

## 📋 Coding Standards

### TypeScript/JavaScript
- Use TypeScript for new code
- Follow existing code style and formatting
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

### Commit Messages
- Use present tense: "Add feature" not "Added feature"
- Use imperative mood: "Move cursor to..." not "Moves cursor to..."
- Limit first line to 72 characters
- Reference issues and pull requests when applicable

### Testing
- Test your changes thoroughly with multiple Xbox accounts
- Verify Home Assistant integration still works
- Check that authentication flow works correctly

## 🎯 Areas Where We Need Help

### High Priority
- **Front-End Improvements**: Better responsive design and UX
- **Authentication UX**: Simplify the OAuth redirect flow
- **Error Handling**: More robust error recovery
- **Documentation**: More examples and use cases

### Medium Priority
- **WebSocket Support**: Real-time updates for Home Assistant
- **API Rate Limiting**: Intelligent throttling
- **Monitoring**: Enhanced metrics and logging
- **Systemd Service**: System service integration for Linux

### Nice to Have
- **Dark Mode**: For the web dashboard
- **Mobile App**: React Native or similar
- **Caching Improvements**: Redis or similar
- **Multi-language Support**: i18n for the dashboard

## 🏠 Home Assistant Specific

If contributing Home Assistant integrations:
- Test with actual HA installation
- Verify sensor availability during API failures
- Ensure dashboard cards render correctly
- Update `home-assistant-config.yaml` if needed

## 🐛 Bug Reports

When reporting bugs, please include:
- Xbox API version
- Node.js version
- Operating system
- Home Assistant version (if applicable)
- Relevant log output
- Steps to reproduce

## 💡 Feature Requests

For feature requests:
- Explain the use case and benefit
- Consider backward compatibility
- Provide implementation suggestions if possible
- Check if it fits with the project's goals

## 🔒 Security

For security issues:
- **DO NOT** open a public issue
- Email security concerns privately
- Include detailed information about the vulnerability
- Allow time for fix before public disclosure

## 📜 Code of Conduct

- Be respectful and inclusive
- Help others learn and grow
- Focus on constructive feedback
- Maintain a positive environment

## 🙏 Recognition

Contributors will be:
- Listed in the README
- Credited in release notes for significant contributions
- Invited to join the core team for sustained contributions

## 📞 Getting Help

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Check the README for common setup issues

Thank you for helping make Xbox API better! 🎮