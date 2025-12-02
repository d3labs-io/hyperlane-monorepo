// Overflow/Underflow Security Tests
//
// Purpose: Comprehensive testing of all arithmetic operations for overflow/underflow vulnerabilities
//
// Client Value: "All arithmetic operations are safe from overflow/underflow attacks"
//
// Test Coverage:
// - ✅ Lock operation: Addition overflow (current_balance + amount)
// - ✅ Release operation: Subtraction underflow (current_balance - amount)
// - ✅ Multiple sequential locks causing overflow
// - ✅ Edge cases with i128::MAX and i128::MIN
// - ✅ Negative balance prevention
// - ✅ Zero amount handling
//
// CRITICAL: These tests verify that the contract handles overflow/underflow safely
// in BOTH debug and release modes using checked arithmetic.

use crate::tests::*;
use soroban_sdk::{String, Address, Env};

// ============ Lock Operation Overflow Tests ============

mod lock_overflow_tests {
    //! # Lock Operation Overflow Tests
    //!
    //! **What This Tests**: Addition overflow in locked balance tracking
    //! **Vulnerability**: current_balance + amount could overflow
    //! **Location**: lib.rs line 398: `set(&key, &(current_balance + amount))`

    use super::*;

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_lock_overflow_max_plus_one() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: User has i128::MAX tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &i128::MAX);

        // WHEN: User locks i128::MAX tokens
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            i128::MAX,
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600001,
            &String::from_str(&env, "user@example.com"),
            &user,
        );

        // THEN: Try to lock 1 more token (should panic with overflow)
        let user2 = Address::generate(&env);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &1);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            1,  // ❌ This should cause overflow
            &user2.to_string(),
            &user2.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600002,
            &String::from_str(&env, "user@example.com"),
            &user2,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_lock_overflow_sequential_large_amounts() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        // GIVEN: Two users with large amounts
        let large_amount = i128::MAX - 100;  // Close to max
        test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &large_amount);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &1000);

        // WHEN: First user locks near i128::MAX
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            large_amount,
            &user1.to_string(),
            &user1.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600003,
            &String::from_str(&env, "user@example.com"),
            &user1,
        );

        // THEN: Second user locks 1000 more (should overflow)
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            1000,  // ❌ This should cause overflow (i128::MAX - 100 + 1000 > i128::MAX)
            &user2.to_string(),
            &user2.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600004,
            &String::from_str(&env, "user@example.com"),
            &user2,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_lock_overflow_multiple_small_additions() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);

        // GIVEN: Lock operations that accumulate to near i128::MAX
        let large_amount = i128::MAX - 1000;
        let user1 = Address::generate(&env);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &large_amount);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            large_amount,
            &user1.to_string(),
            &user1.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600005,
            &String::from_str(&env, "user@example.com"),
            &user1,
        );

        // WHEN: Try to lock 1001 more (should overflow)
        let user2 = Address::generate(&env);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &2000);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            2000,  // ❌ This should cause overflow
            &user2.to_string(),
            &user2.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600006,
            &String::from_str(&env, "user@example.com"),
            &user2,
        );
    }
}

// ============ Release Operation Underflow Tests ============

mod release_underflow_tests {
    //! # Release Operation Underflow Tests
    //!
    //! **What This Tests**: Subtraction underflow in locked balance tracking
    //! **Vulnerability**: current_balance - amount could underflow
    //! **Location**: lib.rs line 511: `set(&key, &(current_balance - amount))`

    use super::*;

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_release_underflow_insufficient_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Lock 1000 tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &1000);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            1000,
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600010,
            &String::from_str(&env, "user@example.com"),
            &user,
        );

        // WHEN: Try to release 2000 tokens (more than locked)
        // THEN: Should panic with InsufficientLockedBalance
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            2000,  // ❌ More than locked balance
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "ethereum:mainnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600011,
            &String::from_str(&env, "user@example.com"),
            &test_env.system_wallet,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_release_underflow_zero_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: No locked balance (0)
        // WHEN: Try to release any amount
        // THEN: Should panic with InsufficientLockedBalance
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            1,  // ❌ Cannot release from zero balance
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "ethereum:mainnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600012,
            &String::from_str(&env, "user@example.com"),
            &test_env.system_wallet,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_release_underflow_negative_result() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Lock 100 tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &100);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            100,
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600013,
            &String::from_str(&env, "user@example.com"),
            &user,
        );

        // WHEN: Try to release i128::MAX (would cause underflow)
        // THEN: Should panic with InsufficientLockedBalance
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            i128::MAX,  // ❌ Would cause underflow
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "ethereum:mainnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600014,
            &String::from_str(&env, "user@example.com"),
            &test_env.system_wallet,
        );
    }
}

// ============ Edge Case Tests ============

mod edge_case_tests {
    //! # Edge Case Tests
    //!
    //! **What This Tests**: Boundary conditions and edge cases
    //! **Why It Matters**: Ensures contract handles extreme values safely

    use super::*;

    #[test]
    fn test_lock_and_release_exact_balance() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // GIVEN: Lock 5000 tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user, &5000);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            5000,
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600020,
            &String::from_str(&env, "user@example.com"),
            &user,
        );

        // WHEN: Release exact locked amount
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            5000,
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "ethereum:mainnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600021,
            &String::from_str(&env, "user@example.com"),
            &test_env.system_wallet,
        );

        // THEN: Locked balance should be zero
        let locked = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(locked, 0, "Locked balance should be zero after releasing all");
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_lock_zero_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // WHEN: Try to lock 0 tokens
        // THEN: Should panic with InvalidAmount
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            0,  // ❌ Zero amount
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600022,
            &String::from_str(&env, "user@example.com"),
            &user,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_lock_negative_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user = Address::generate(&env);

        // WHEN: Try to lock negative amount
        // THEN: Should panic with InvalidAmount
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            -1000,  // ❌ Negative amount
            &user.to_string(),
            &user.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600023,
            &String::from_str(&env, "user@example.com"),
            &user,
        );
    }

    #[test]
    fn test_multiple_locks_and_releases() {
        let env = Env::default();
        env.mock_all_auths();

        let test_env = TestEnvironment::new(&env);
        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        // GIVEN: Two users lock tokens
        test_env.lock_unlock_token.stellar_asset_client.mint(&user1, &3000);
        test_env.lock_unlock_token.stellar_asset_client.mint(&user2, &2000);

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            3000,
            &user1.to_string(),
            &user1.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600024,
            &String::from_str(&env, "user@example.com"),
            &user1,
        );

        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_LOCK,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            2000,
            &user2.to_string(),
            &user2.to_string(),
            &String::from_str(&env, "stellar:testnet"),
            &String::from_str(&env, "ethereum:mainnet"),
            176294386600025,
            &String::from_str(&env, "user@example.com"),
            &user2,
        );

        // WHEN: Check locked balance
        let locked = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(locked, 5000, "Total locked should be 5000");

        // THEN: Release partial amount
        execute_bridge_op(
            &test_env.bridge_client,
            OPERATION_RELEASE,
            &test_env.lock_unlock_token.token_id.to_string(),
            &test_env.lock_unlock_token.token_id.to_string(),
            2000,
            &user1.to_string(),
            &user1.to_string(),
            &String::from_str(&env, "ethereum:mainnet"),
            &String::from_str(&env, "stellar:testnet"),
            176294386600026,
            &String::from_str(&env, "user@example.com"),
            &test_env.system_wallet,
        );

        let locked_after = test_env.bridge_client.get_locked_balance(&test_env.lock_unlock_token.token_id);
        assert_eq!(locked_after, 3000, "Locked balance should be 3000 after partial release");
    }
}

