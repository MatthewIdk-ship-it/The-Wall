# Delete account function

The account deletion button calls this Supabase Edge Function. Deploy it from the project directory with the Supabase CLI:

```sh
supabase functions deploy delete-account
```

The function uses the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables provided to Supabase Edge Functions. Do not expose the service role key in the browser or commit it to the repository.

The function verifies the caller's access token, deletes only that authenticated user, and removes files under that user's `post-images` storage folder. Database rows referencing the user are removed by the schema's cascading foreign keys.
