@echo off
REM Run all tests (unit tests and E2E tests)

echo Running all tests...
echo.

REM Run unit tests
echo Running unit tests...
cd frontend
call npm run test
cd ..

echo.
echo All tests completed!
echo.
pause
