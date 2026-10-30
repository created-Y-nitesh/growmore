async function test() {
  const email = `varun_${Date.now()}@gmail.com`;
  console.log('Testing register for email:', email);
  try {
    const regRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Varun Sharma',
        dob: '2000-10-17',
        email: email,
        password: 'Password@123'
      })
    });
    const regData = await regRes.json();
    console.log('Register response:', regRes.status, regData);

    if (regData.devOtp) {
      console.log('Verifying OTP with devOtp:', regData.devOtp);
      const verifyRes = await fetch('http://localhost:5000/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          otp: regData.devOtp,
          purpose: 'register'
        })
      });
      const verifyData = await verifyRes.json();
      console.log('Verify response:', verifyRes.status, verifyData);
    }
  } catch (err) {
    console.error('Test error:', err);
  }
}
test();
